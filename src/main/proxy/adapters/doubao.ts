/**
 * Doubao (豆包) Web API Adapter
 * Directly calls www.doubao.com internal APIs
 *
 * Based on doubao-free-api reverse engineering
 */

import crypto from 'crypto'
import axios, { AxiosResponse } from 'axios'
import { PassThrough } from 'stream'
import { createParser } from 'eventsource-parser'
import { Account, Provider } from '../../store/types'

const DOUBAO_BASE = 'https://www.doubao.com'
const MODEL_NAME = 'doubao'
const DEFAULT_ASSISTANT_ID = '497858'
const VERSION_CODE = '20800'
const PC_VERSION = '2.44.0'
const MAX_RETRY = 3
const RETRY_DELAY = 5000

const FAKE_HEADERS = {
  Accept: '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Last-Event-Id': 'undefined',
  Origin: DOUBAO_BASE,
  Pragma: 'no-cache',
  Priority: 'u=1, i',
  Referer: DOUBAO_BASE,
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

function uuid(): string {
  return crypto.randomUUID()
}

function randomStr(length: number, charset = 'alphanumeric'): string {
  const chars =
    charset === 'numeric'
      ? '0123456789'
      : '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Doubao Proxy Adapter
 */
export class DoubaoAdapter {
  // Match doubao-free-api: module-level constants, generated once and reused
  // (original doubao-free-api uses: const DEVICE_ID / const WEB_ID at module scope)
  private static deviceId: string = `7${randomStr(18, 'numeric')}`
  private static webId: string = `7${randomStr(18, 'numeric')}`

  private provider: Provider
  private account: Account
  private sessionId: string
  /** Last conversation ID from chat completion (exposed for session cleanup) */
  public lastConversationId: string = ''

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
    this.sessionId = account.credentials.token || ''
  }

  static isDoubaoProvider(provider: Provider): boolean {
    return provider.id === 'doubao' || provider.apiEndpoint.includes('doubao.com')
  }

  /**
   * Chat completion (handles both stream and non-stream)
   */
  async chatCompletion(options: {
    model: string
    messages: any[]
    stream?: boolean
    temperature?: number
  }): Promise<{
    response: any
    conversationId: string
  }> {
    const { messages, stream = true } = options

    if (stream) {
      return this.chatCompletionStream(messages)
    }
    return this.chatCompletionSync(messages)
  }

  /**
   * Non-streaming chat completion
   */
  private async chatCompletionSync(messages: any[]): Promise<{ response: any; conversationId: string }> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const response = await this.sendChatRequest(messages, false)
        const { data: answer, convId } = await this.receiveStream(response.data)
        this.lastConversationId = convId
        return { response: answer, conversationId: convId }
      } catch (err) {
        lastError = err as Error
        if (attempt < MAX_RETRY) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY))
        }
      }
    }
    throw lastError || new Error('Chat completion failed')
  }

  /**
   * Streaming chat completion
   */
  private async chatCompletionStream(messages: any[]): Promise<{ response: PassThrough; conversationId: string }> {
    const doStream = async (retryCount: number): Promise<{ stream: PassThrough; convId: string }> => {
      try {
        const res = await this.sendChatRequest(messages, true)
        if (!res.headers['content-type']?.includes('text/event-stream')) {
          // Read response body for debugging
          let bodyPreview = ''
          if (res.data) {
            bodyPreview = typeof res.data === 'string' ? res.data.substring(0, 200) : JSON.stringify(res.data).substring(0, 200)
          }
          const errStream = new PassThrough()
          errStream.end(
            `data: ${JSON.stringify({
              id: '',
              model: MODEL_NAME,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { role: 'assistant', content: `[豆包异常] HTTP ${res.status} type:${res.headers['content-type']} body:${bodyPreview}` }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              created: unixTimestamp(),
            })}\n\n`
          )
          return { stream: errStream, convId: '' }
        }
        return this.createTransStream(res.data)
      } catch (err) {
        if (retryCount < MAX_RETRY) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY))
          return doStream(retryCount + 1)
        }
        throw err
      }
    }

    const { stream, convId } = await doStream(0)
    this.lastConversationId = convId
    return { response: stream, conversationId: convId }
  }

  /**
   * Send HTTP request to Doubao chat API
   * Replicates doubao-free-api's request() function EXACTLY
   */
  private async sendChatRequest(messages: any[], isStream: boolean): Promise<AxiosResponse> {
    const body = this.buildChatBody(messages)

    const chatOptions: any = {
      data: body,
      headers: {
        Referer: 'https://www.doubao.com/chat/',
        'agw-js-conv': 'str, str',
      },
      timeout: 300000,
      responseType: 'stream',
    }

    const baseParams: Record<string, any> = {
      aid: DEFAULT_ASSISTANT_ID,
      device_id: DoubaoAdapter.deviceId,
      device_platform: 'web',
      language: 'zh',
      pc_version: PC_VERSION,
      pkg_type: 'release_version',
      real_aid: DEFAULT_ASSISTANT_ID,
      region: 'CN',
      samantha_web: 1,
      sys_region: 'CN',
      tea_uuid: DoubaoAdapter.webId,
      'use-olympus-account': 1,
      version_code: VERSION_CODE,
      web_id: DoubaoAdapter.webId,
      web_tab_id: uuid(),
    }

    console.log('[Doubao] -> POST /samantha/chat/completion, sessionid:', this.sessionId?.substring(0, 16), '...')

    const response = await axios.request({
      method: 'POST',
      url: `${DOUBAO_BASE}/samantha/chat/completion`,
      params: { ...baseParams, ...(chatOptions.params || {}) },
      headers: {
        ...FAKE_HEADERS,
        Cookie: `sessionid=${this.sessionId}; sessionid_ss=${this.sessionId}`,
        'X-Flow-Trace': `04-${uuid()}-${uuid().substring(0, 16)}-01`,
        ...(chatOptions.headers || {}),
      },
      validateStatus: () => true,
      timeout: chatOptions.timeout,
      data: chatOptions.data,
      responseType: 'stream',
    })

    console.log('[Doubao] <- status:', response.status, 'content-type:', response.headers['content-type'])
    return response
  }

  /**
   * Build request body for Doubao chat API
   */
  private buildChatBody(messages: any[]): any {
    const content = this.buildMessagesContent(messages)

    return {
      messages: [
        {
          content: JSON.stringify({ text: content }),
          content_type: 2001,
          attachments: [],
          references: [],
        },
      ],
      completion_option: {
        is_regen: false,
        with_suggest: true,
        need_create_conversation: true,
        launch_stage: 1,
        is_replace: false,
        is_delete: false,
        message_from: 0,
        action_bar_skill_id: 0,
        use_deep_think: false,
        use_auto_cot: false,
        resend_for_regen: false,
        enable_commerce_credit: false,
        event_id: '0',
      },
      evaluate_option: { web_ab_params: '' },
      section_id: `26${randomStr(16, 'numeric')}`,
      conversation_id: '0',
      local_conversation_id: `local_16${randomStr(14, 'numeric')}`,
      local_message_id: uuid(),
    }
  }

  /**
   * Convert OpenAI-style messages to Doubao format
   * Uses <|im_start|>role\ncontent<|im_end|> format for multi-turn
   */
  private buildMessagesContent(messages: any[]): string {
    if (!messages.length) return ''

    // Single message: pass through directly
    if (messages.length < 2) {
      const msg = messages[0]
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter((v: any) => v && v.type === 'text')
          .map((v: any) => v.text || '')
          .join('\n')
      }
      return typeof msg.content === 'string' ? msg.content : ''
    }

    // Multiple messages: merge with im_start/im_end format
    let content = ''
    for (const msg of messages) {
      const role = msg.role
        .replace('system', '<|im_start|>system')
        .replace('assistant', '<|im_start|>assistant')
        .replace('user', '<|im_start|>user')

      if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter((v: any) => v && v.type === 'text')
          .map((v: any) => v.text || '')
          .join('\n')
        content += `${role}\n${text}\n<|im_end|>\n`
      } else {
        content += `${role}\n${msg.content || ''}\n<|im_end|>\n`
      }
    }
    return content
  }

  /**
   * Receive complete stream response (non-streaming)
   * Returns both the parsed response data and the conversation ID
   */
  private receiveStream(stream: any): Promise<{ data: any; convId: string }> {
    return new Promise((resolve, reject) => {
      const data: any = {
        id: '', model: MODEL_NAME, object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        created: unixTimestamp(),
      }
      let convId = ''
      let isEnd = false

      // v3 API: onEvent receives {id, event, data} — NO type field!
      const parser = createParser({
        onEvent: (event: any) => {
          try {
            if (isEnd) return
            const raw = JSON.parse(event.data)
            if (raw.code) throw new Error(`Doubao error: ${raw.message || raw.code}`)
            if (raw.event_type === 2003) { isEnd = true; data.choices[0].message.content = data.choices[0].message.content.replace(/\n$/, ''); return resolve({ data, convId }) }
            if (raw.event_type !== 2001) return
            const result = JSON.parse(raw.event_data)
            if (!convId && result.conversation_id) { convId = result.conversation_id; this.lastConversationId = convId; data.id = convId }
            if (result.is_finish) { isEnd = true; data.choices[0].message.content = data.choices[0].message.content.replace(/\n$/, ''); return resolve({ data, convId }) }
            const message = result.message
            if (!message?.content) return
            let text = ''
            try {
              const parsed = JSON.parse(message.content)
              if (typeof parsed === 'string') text = parsed
              else if (typeof parsed.text === 'string') text = parsed.text
              else if (parsed.delta?.text) text = parsed.delta.text
              else if (typeof parsed.content === 'string') text = parsed.content
            } catch { text = typeof message.content === 'string' ? message.content : '' }
            if (text) data.choices[0].message.content += text
          } catch (err) { reject(err) }
        },
      })

      let temp = Buffer.alloc(0)
      stream.on('data', (buffer: Buffer) => {
        if (buffer.toString().includes('�')) { temp = Buffer.concat([temp, buffer]); return }
        if (temp.length > 0) { buffer = Buffer.concat([temp, buffer]); temp = Buffer.alloc(0) }
        parser.feed(buffer.toString())
      })
      stream.once('error', reject)
      stream.once('close', () => { data.choices[0].message.content = data.choices[0].message.content.replace(/\n$/, ''); resolve({ data, convId }) })
    })
  }

  /**
   * Create OpenAI-compatible SSE transform stream
   * Uses eventsource-parser v3 (onEvent receives {id, event, data} - NO type field)
   */
  private createTransStream(stream: any): { stream: PassThrough; convId: string } {
    let convId = ''
    let rawEventCount = 0
    let textEventCount = 0
    const created = unixTimestamp()
    const transStream = new PassThrough()

    const sw = (content: string, finishReason: string | null = null) => {
      if (!transStream.writable || transStream.destroyed) return
      try { transStream.write(`data: ${JSON.stringify({ id: convId, model: MODEL_NAME, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: finishReason }], created })}\n\n`) } catch {}
    }
    const se = () => { if (transStream.writable) try { transStream.end('data: [DONE]\n\n') } catch {} }

    sw('')

    // eventsource-parser v3: onEvent fires for every SSE data event
    const parser = createParser({
      onEvent: (event: any) => {
        try {
          rawEventCount++
          const raw = JSON.parse(event.data)
          if (rawEventCount <= 3) {
            console.log('[Doubao SSE] event #' + rawEventCount + ', event_type:', raw.event_type, ', has event_data:', !!raw.event_data)
          }
          if (raw.code) {
            console.error('[Doubao SSE] API error:', raw.code, raw.message)
            sw(`[豆包错误: ${raw.message || raw.code}]`, 'stop')
            return se()
          }
          if (raw.event_type === 2003) {
            console.log('[Doubao SSE] stream end (2003), total events:', rawEventCount, ', text events:', textEventCount)
            sw('', 'stop')
            return se()
          }
          if (raw.event_type !== 2001) {
            // Log unexpected event types for debugging
            if (rawEventCount <= 5) console.log('[Doubao SSE] Skipping event_type:', raw.event_type, ', data keys:', Object.keys(raw).join(','))
            return
          }
          textEventCount++
          const result = JSON.parse(raw.event_data)
          if (!convId && result.conversation_id) { convId = result.conversation_id; this.lastConversationId = convId }
          if (result.is_finish) {
            console.log('[Doubao SSE] finish flag, text events:', textEventCount)
            sw('', 'stop')
            return se()
          }
          const message = result.message
          if (!message?.content) return
          let text = ''
          try {
            const parsed = JSON.parse(message.content)
            if (typeof parsed === 'string') text = parsed
            else if (typeof parsed.text === 'string') text = parsed.text
            else if (parsed.delta?.text) text = parsed.delta.text
            else if (typeof parsed.content === 'string') text = parsed.content
          } catch {
            // message.content might be plain text (not JSON)
            text = typeof message.content === 'string' ? message.content : ''
          }
          if (text) {
            if (textEventCount <= 3) console.log('[Doubao SSE] Text chunk #' + textEventCount + ':', text.substring(0, 80))
            sw(text)
          }
        } catch (e) {
          console.error('[Doubao SSE] Event parse error, rawEventCount:', rawEventCount, ', error:', e)
        }
      },
      onError: (err: any) => {
        console.error('[Doubao SSE] Parser error:', err?.message || err, ', field:', err?.field, ', line:', err?.line?.substring?.(0, 100))
      },
    })

    // Handle split multi-byte UTF-8 characters (like receiveStream does)
    // Chinese characters are 3 bytes in UTF-8; if split across TCP chunks,
    // toString('utf8') produces � replacement characters, corrupting JSON
    let temp = Buffer.alloc(0)
    stream.on('data', (buffer: Buffer) => {
      if (buffer.toString().includes('�')) {
        temp = Buffer.concat([temp, buffer])
        return
      }
      if (temp.length > 0) {
        buffer = Buffer.concat([temp, buffer])
        temp = Buffer.alloc(0)
      }
      parser.feed(buffer.toString())
    })
    stream.once('error', () => se())
    stream.once('close', () => {
      console.log('[Doubao SSE] Close, total events:', rawEventCount, ', text events:', textEventCount)
      if (rawEventCount === 0) {
        console.error('[Doubao SSE] No events received from doubao API')
        sw('[豆包无响应]', 'stop')
      }
      se()
    })
    return { stream: transStream, convId }
  }

  /**
   * Delete conversation from Doubao web to avoid cluttering user's chat list.
   * Public - called by forwarder based on shouldDeleteSession() setting.
   */
  async deleteSession(convId: string): Promise<boolean> {
    if (!convId) return false
    try {
      const msToken = crypto.randomBytes(96).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const aBogus = `mf-${randomStr(34)}-${randomStr(6)}`

      const baseParams: Record<string, any> = {
        msToken,
        a_bogus: aBogus,
        aid: DEFAULT_ASSISTANT_ID,
        device_id: DoubaoAdapter.deviceId,
        device_platform: 'web',
        language: 'zh',
        pc_version: PC_VERSION,
        region: 'CN',
        samantha_web: 1,
        sys_region: 'CN',
        tea_uuid: DoubaoAdapter.webId,
        version_code: VERSION_CODE,
        web_id: DoubaoAdapter.webId,
        web_tab_id: uuid(),
      }

      await axios.request({
        method: 'POST',
        url: `${DOUBAO_BASE}/samantha/thread/delete`,
        params: baseParams,
        headers: {
          ...FAKE_HEADERS,
          Referer: `${DOUBAO_BASE}/chat/${convId}`,
          'Agw-Js-Conv': 'str',
          Cookie: `sessionid=${this.sessionId}; sessionid_ss=${this.sessionId}`,
        },
        data: { conversation_id: convId },
        timeout: 15000,
        validateStatus: () => true,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Validate sessionid via Doubao account info API
   */
  static async validateToken(sessionId: string): Promise<boolean> {
    try {
      const res = await axios.request({
        method: 'POST',
        url: `${DOUBAO_BASE}/passport/account/info/v2`,
        params: {
          account_sdk_source: 'web',
          aid: DEFAULT_ASSISTANT_ID,
          device_id: DoubaoAdapter.deviceId,
          device_platform: 'web',
          language: 'zh',
          pc_version: PC_VERSION,
          region: 'CN',
          samantha_web: 1,
          sys_region: 'CN',
          tea_uuid: DoubaoAdapter.webId,
          version_code: VERSION_CODE,
          web_id: DoubaoAdapter.webId,
        },
        headers: {
          ...FAKE_HEADERS,
          Cookie: `sessionid=${sessionId}; sessionid_ss=${sessionId}`,
        },
        timeout: 15000,
        validateStatus: () => true,
      })

      if (res.status === 200 && res.data) {
        return !!(res.data.user_id || res.data?.data?.user_id)
      }
      return false
    } catch {
      return false
    }
  }
}

export default DoubaoAdapter
