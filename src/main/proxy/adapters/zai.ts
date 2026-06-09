/**
 * Z.ai Adapter (Open WebUI v0.6.2 API)
 * Implements Z.ai API via Open WebUI's OpenAI-compatible chat completions endpoint
 */

import axios, { AxiosResponse } from 'axios'
import { PassThrough } from 'stream'
import { createParser } from 'eventsource-parser'
import { Account, Provider } from '../../store/types'
import { hasToolUse, parseToolUse, ToolCall } from '../promptToolUse'
import { parseToolCallsFromText } from '../utils/toolParser'
import { 
  createToolCallState, 
  processStreamContent, 
  flushToolCallBuffer,
  createBaseChunk,
  ToolCallState 
} from '../utils/streamToolHandler'

const ZAI_API_BASE = 'https://chat.z.ai'

interface ZaiMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | any[]
}

interface ChatCompletionRequest {
  model: string
  /** Original model name before mapping (used for feature detection like web search, thinking mode) */
  originalModel?: string
  messages: ZaiMessage[]
  stream?: boolean
  temperature?: number
  web_search?: boolean
  reasoning_effort?: 'low' | 'medium' | 'high' | boolean
}

export class ZaiAdapter {
  private provider: Provider
  private account: Account

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
  }

  private getToken(): string {
    const credentials = this.account.credentials
    return credentials.token || credentials.accessToken || credentials.jwt || ''
  }

  private async ensureToken(): Promise<string> {
    const token = this.getToken()
    if (token) {
      return token
    }
    throw new Error('Z.ai token not configured, please add token in account settings')
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{ response: AxiosResponse; chatId: string; requestId: string }> {
    const token = await this.ensureToken()
    
    console.log('[Z.ai] chatCompletion called with request.model:', request.model)
    
    // Z.ai / Open WebUI model name mapping
    // After migration to Open WebUI, only glm-5 is confirmed available.
    // glm-5.1 / glm-5-turbo do not exist as API model IDs (404).
    const modelMapping: Record<string, string> = {
      'glm-5': 'glm-5',
      'glm-5.1': 'glm-5',
      'glm-5-turbo': 'glm-5',
      // Handle uppercase input -> lowercase -> glm-5
      'GLM-5': 'glm-5',
      'GLM-5.1': 'glm-5',
      'GLM-5-Turbo': 'glm-5',
    }
    const mappedModel = modelMapping[request.model] || modelMapping[request.model.toLowerCase()] || request.model
    
    console.log('[Z.ai] Original model:', request.model, '-> Mapped model:', mappedModel)
    
    // Build messages preserving system messages (Open WebUI supports system role natively)
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }))
    
    // Open WebUI chat completions: simple POST with Bearer token
    const requestBody: any = {
      model: mappedModel,
      messages,
      stream: request.stream !== false,
    }

    // Add optional parameters if provided
    if (request.temperature !== undefined) {
      requestBody.temperature = request.temperature
    }
    
    // Determine thinking/reasoning mode
    const modelForDetection = request.originalModel || request.model
    const modelLower = modelForDetection.toLowerCase()
    let enableThinking = !!request.reasoning_effort
    let enableWebSearch = !!request.web_search
    
    if (!enableThinking && (modelLower.includes('think') || modelLower.includes('r1'))) {
      enableThinking = true
      console.log('[Z.ai] Thinking mode enabled (from model name)')
    }
    if (!enableWebSearch && modelLower.includes('search')) {
      enableWebSearch = true
      console.log('[Z.ai] Web search enabled (from model name)')
    }

    // Open WebUI supports these as body params
    if (enableWebSearch) {
      requestBody.web_search = true
    }

    console.log('[Z.ai] Sending chat request...')
    console.log('[Z.ai] Model:', mappedModel)
    console.log('[Z.ai] Stream:', requestBody.stream)
    console.log('[Z.ai] Messages count:', messages.length)

    // Retry up to 4 times with longer backoff for Z.Ai rate limiting
    // Z.Ai free tier has aggressive rate limiting (~5s cooldown per request)
    let response: AxiosResponse | null = null
    let lastError: any = null
    let lastStatus = 0
    const retryDelays = [2000, 3000, 5000] // 2s, 3s, 5s backoff
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      if (attempt > 0) {
        const delay = retryDelays[attempt - 1]
        console.log(`[Z.ai] Rate limited (${lastStatus}), retry ${attempt}/${retryDelays.length} after ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
      try {
        response = await axios.post(
          `${ZAI_API_BASE}/api/v1/chat/completions`,
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              Origin: ZAI_API_BASE,
              Referer: `${ZAI_API_BASE}/`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            },
            responseType: 'stream',
            timeout: 120000,
            validateStatus: () => true,
          }
        )
        
        lastStatus = response!.status
        // Success or non-retryable error -> break
        if (lastStatus === 200 || (lastStatus !== 404 && lastStatus !== 429 && lastStatus !== 503)) {
          break
        }
        
        console.log(`[Z.ai] Got ${lastStatus}, will retry...`)
      } catch (err) {
        lastError = err
        console.log(`[Z.ai] Request error (attempt ${attempt + 1}):`, err)
        if (attempt === retryDelays.length) throw err // last attempt, propagate error
      }
    }

    if (!response) {
      throw lastError || new Error('Z.ai request failed after retries')
    }

    console.log('[Z.ai] Response status:', response.status)
    if (response.status !== 200) {
      if (response.data && typeof response.data.on === 'function') {
        const chunks: Buffer[] = []
        response.data.on('data', (chunk: Buffer) => chunks.push(chunk))
        await new Promise<void>((resolve) => {
          response.data.on('end', () => resolve())
          response.data.on('error', () => resolve())
        })
        const errorBody = Buffer.concat(chunks).toString('utf8')
        console.log('[Z.ai] Error response body:', errorBody)
      } else if (response.data) {
        // Non-stream error response
        try {
          const errorStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
          console.log('[Z.ai] Error response:', errorStr)
        } catch {}
      }
    }

    // No chatId needed for Open WebUI API (stateless completions)
    return { response, chatId: '', requestId: '' }
  }

  static isZaiProvider(provider: Provider): boolean {
    return provider.id === 'zai' || provider.apiEndpoint.includes('z.ai') || provider.apiEndpoint.includes('chat.z.ai')
  }
}

export class ZaiStreamHandler {
  private chatId: string = ''
  private model: string
  private created: number
  private onEnd?: (chatId: string) => void
  private content: string = ''
  private toolCallState: ToolCallState
  private sentRole: boolean = false
  private sentThinkingRole: boolean = false
  private reasoningContent: string = ''
  private pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map()

  constructor(model: string, onEnd?: (chatId: string) => void) {
    this.model = model
    this.created = Math.floor(Date.now() / 1000)
    this.onEnd = onEnd
    this.toolCallState = createToolCallState()
  }

  setChatId(chatId: string) {
    this.chatId = chatId
  }

  getChatId(): string {
    return this.chatId
  }

  /**
   * Handle OpenAI-compatible SSE stream from Open WebUI
   */
  async handleStream(stream: any): Promise<PassThrough> {
    const transStream = new PassThrough()
    const requestId = `chatcmpl-${Date.now().toString(36)}`

    console.log('[Z.ai] Starting Open WebUI stream handler...')
    
    let streamEnded = false

    const safeEnd = (data?: string) => {
      if (streamEnded) return
      streamEnded = true
      if (data) {
        transStream.end(data)
      } else {
        transStream.end()
      }
    }

    const parser = createParser({
      onEvent: (event: any) => {
        try {
          if (event.data === '[DONE]') {
            // Check if we had any pending tool calls in the accumulated content
            if (this.toolCallState.hasBufferedContent) {
              const baseChunk = createBaseChunk(requestId, this.model, this.created)
              const flushChunks = flushToolCallBuffer(this.toolCallState, baseChunk, 'zai')
              for (const outChunk of flushChunks) {
                transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
              }
            }
            
            // Send final chunk with finish_reason
            const finishReason = this.toolCallState.hasEmittedToolCall ? 'tool_calls' : 'stop'
            transStream.write(
              `data: ${JSON.stringify({
                id: requestId,
                model: this.model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                created: this.created,
              })}\n\n`
            )
            safeEnd('data: [DONE]\n\n')
            if (this.onEnd) {
              try {
                this.onEnd(this.chatId)
              } catch (e) {
                console.error('[Z.ai] onEnd callback error:', e)
              }
            }
            return
          }

          const data = JSON.parse(event.data)
          if (!data.choices || data.choices.length === 0) return
          
          const choice = data.choices[0]
          const delta = choice.delta || {}

          // Handle reasoning_content (thinking phase)
          if (delta.reasoning_content) {
            if (!this.sentThinkingRole) {
              transStream.write(
                `data: ${JSON.stringify({
                  id: requestId,
                  model: this.model,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: '' }, finish_reason: null }],
                  created: this.created,
                })}\n\n`
              )
              this.sentThinkingRole = true
            }
            transStream.write(
              `data: ${JSON.stringify({
                id: requestId,
                model: this.model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: { reasoning_content: delta.reasoning_content }, finish_reason: null }],
                created: this.created,
              })}\n\n`
            )
            this.reasoningContent += delta.reasoning_content
          }

          // Handle text content delta
          if (delta.content) {
            this.content += delta.content
            
            // Process tool call interception via content parsing
            const baseChunk = createBaseChunk(requestId, this.model, this.created)
            const { chunks: outputChunks } = processStreamContent(
              delta.content, 
              this.toolCallState, 
              baseChunk, 
              !this.sentRole && !this.sentThinkingRole,
              'zai'
            )

            for (const outChunk of outputChunks) {
              transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
            }

            if (outputChunks.length > 0) this.sentRole = true
          }

          // Handle native OpenAI tool_calls delta
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0
              if (!this.pendingToolCalls.has(index)) {
                this.pendingToolCalls.set(index, {
                  id: tc.id || `call_${index}`,
                  name: '',
                  args: '',
                })
              }
              const pending = this.pendingToolCalls.get(index)!
              if (tc.id) pending.id = tc.id
              if (tc.function?.name) pending.name = tc.function.name
              if (tc.function?.arguments) pending.args += tc.function.arguments
            }

            // Send tool_calls delta directly
            const toolCallsOutput: any[] = []
            for (const tc of delta.tool_calls) {
              toolCallsOutput.push({
                index: tc.index ?? 0,
                id: tc.id || undefined,
                type: 'function',
                function: {
                  name: tc.function?.name || undefined,
                  arguments: tc.function?.arguments || undefined,
                },
              })
            }

            if (toolCallsOutput.length > 0) {
              if (!this.sentRole) {
                transStream.write(
                  `data: ${JSON.stringify({
                    id: requestId,
                    model: this.model,
                    object: 'chat.completion.chunk',
                    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
                    created: this.created,
                  })}\n\n`
                )
                this.sentRole = true
              }
              transStream.write(
                `data: ${JSON.stringify({
                  id: requestId,
                  model: this.model,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: { tool_calls: toolCallsOutput }, finish_reason: null }],
                  created: this.created,
                })}\n\n`
              )
            }
          }

          // Handle finish_reason with content in final delta
          if (choice.finish_reason && choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') {
            console.log('[Z.ai] Stream finish_reason:', choice.finish_reason)
          }
        } catch (err) {
          console.error('[Z.ai] Stream parse error:', err)
        }
      },
    })

    stream.on('data', (buffer: Buffer) => {
      if (streamEnded) return
      parser.feed(buffer.toString())
    })
    stream.once('error', (err: Error) => {
      console.error('[Z.ai] Stream error:', err)
      safeEnd('data: [DONE]\n\n')
    })
    stream.once('close', () => {
      console.log('[Z.ai] Stream closed')
      // Ensure we send DONE if not already ended
      if (!streamEnded) {
        // Flush remaining tool call buffer
        if (this.toolCallState.hasBufferedContent) {
          const baseChunk = createBaseChunk(requestId, this.model, this.created)
          const flushChunks = flushToolCallBuffer(this.toolCallState, baseChunk, 'zai')
          for (const outChunk of flushChunks) {
            transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
          }
        }
        safeEnd('data: [DONE]\n\n')
      }
    })

    return transStream
  }

  async handleNonStream(response: any): Promise<any> {
    console.log('[Z.ai] Starting non-stream handler...')
    
    return new Promise((resolve, reject) => {
      const result = {
        id: '',
        model: this.model,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '', reasoning_content: '' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        created: this.created,
      }

      let resolved = false
      const resolveOnce = (data: any) => {
        if (resolved) return
        resolved = true
        resolve(data)
      }
      const rejectOnce = (err: Error) => {
        if (resolved) return
        resolved = true
        reject(err)
      }

      setTimeout(() => {
        if (!resolved) {
          console.log('[Z.ai] Non-stream timeout, resolving with current data')
          resolveOnce(result)
        }
      }, 60000)

      const streamData = response

      if (streamData && typeof streamData.on === 'function') {
        console.log('[Z.ai] Non-stream: taking stream path')
        const parser = createParser({
          onEvent: (event: any) => {
            try {
              if (event.data === '[DONE]') {
                resolveOnce(result)
                return
              }
              const eventData = JSON.parse(event.data)
              if (!eventData.choices || eventData.choices.length === 0) return
              
              const choice = eventData.choices[0]
              const delta = choice.delta || {}

              if (delta.reasoning_content) {
                result.choices[0].message.reasoning_content += delta.reasoning_content
              }
              if (delta.content) {
                result.choices[0].message.content += delta.content
              }
              if (choice.finish_reason) {
                if (eventData.usage) {
                  result.usage = eventData.usage
                }
                resolveOnce(result)
              }
            } catch (err) {
              rejectOnce(err instanceof Error ? err : new Error(String(err)))
            }
          },
        })

        streamData.on('data', (buffer: Buffer) => parser.feed(buffer.toString()))
        streamData.once('error', rejectOnce)
        streamData.once('close', () => {
          console.log('[Z.ai] Non-stream closed, content length:', result.choices[0].message.content.length)
          resolveOnce(result)
        })
      } else if (streamData) {
        try {
          if (typeof streamData === 'string') {
            let content = ''
            let reasoning = ''
            const lines = streamData.split('\n')
            for (const line of lines) {
              if (line.startsWith('data:')) {
                const jsonStr = line.substring(5).trim()
                if (jsonStr === '[DONE]') continue
                try {
                  const event = JSON.parse(jsonStr)
                  if (event.choices?.[0]) {
                    const delta = event.choices[0].delta || {}
                    if (delta.reasoning_content) reasoning += delta.reasoning_content
                    if (delta.content) content += delta.content
                  }
                } catch {}
              }
            }
            result.choices[0].message.content = content
            if (reasoning) {
              result.choices[0].message.reasoning_content = reasoning
            }
          } else {
            result.choices[0].message.content = streamData.choices?.[0]?.message?.content || ''
          }
          console.log('[Z.ai] Non-stream JSON finished, content length:', result.choices[0].message.content.length)
          resolveOnce(result)
        } catch (err) {
          rejectOnce(err instanceof Error ? err : new Error(String(err)))
        }
      } else {
        resolveOnce(result)
      }
    })
  }
}

export const zaiAdapter = {
  ZaiAdapter,
  ZaiStreamHandler,
}
