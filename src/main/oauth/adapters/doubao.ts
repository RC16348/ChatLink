/**
 * Doubao (豆包) Authentication Adapter
 * Supports:
 *  - cookie: auto-extract sessionid via in-app browser login
 *  - manual: manually paste sessionid
 */

import { BaseOAuthAdapter } from './base'
import { DoubaoAdapter as DoubaoProxyAdapter } from '../../proxy/adapters/doubao'
import {
  OAuthResult,
  OAuthOptions,
  TokenValidationResult,
  CredentialInfo,
  AdapterConfig,
  OAuthCallbackData,
} from '../types'

export class DoubaoAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'doubao',
      authMethods: ['manual', 'cookie'],
      loginUrl: 'https://www.doubao.com',
      apiUrl: 'https://www.doubao.com',
    })
  }

  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    return {
      success: false,
      providerId: options.providerId,
      providerType: 'doubao',
      error: 'Use startInAppLogin for automatic sessionid extraction from doubao.com',
    }
  }

  async loginWithCookies(providerId: string, cookies: Record<string, string>): Promise<OAuthResult> {
    this.emitProgress('pending', '正在验证自动获取的 Session ID...')

    const sessionId = cookies['sessionid'] || cookies['token']
    if (!sessionId) {
      return {
        success: false,
        providerId,
        providerType: 'doubao',
        error: '未能从 doubao.com 获取 sessionid Cookie，请确认已登录',
      }
    }

    const valid = await DoubaoProxyAdapter.validateToken(sessionId)
    if (!valid) {
      return {
        success: false,
        providerId,
        providerType: 'doubao',
        error: 'Session ID 验证失败，请确认已登录 doubao.com',
      }
    }

    this.emitProgress('success', 'Session ID 自动获取并验证成功')
    return {
      success: true,
      providerId,
      providerType: 'doubao',
      credentials: { token: sessionId },
      accountInfo: { name: 'Doubao User' },
    }
  }

  async loginWithToken(providerId: string, token: string): Promise<OAuthResult> {
    this.emitProgress('pending', '正在验证 Session ID...')

    try {
      const valid = await DoubaoProxyAdapter.validateToken(token)
      if (!valid) {
        return {
          success: false,
          providerId,
          providerType: 'doubao',
          error: 'Session ID 验证失败，请确保已登录 www.doubao.com',
        }
      }

      this.emitProgress('success', 'Session ID 验证成功')
      return {
        success: true,
        providerId,
        providerType: 'doubao',
        credentials: { token },
        accountInfo: { name: 'Doubao User' },
      }
    } catch (error) {
      return {
        success: false,
        providerId,
        providerType: 'doubao',
        error: error instanceof Error ? error.message : '验证请求失败',
      }
    }
  }

  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    // Support both 'token' (manual input) and 'sessionid' (auto-extracted via inAppLogin)
    const token = credentials.token || credentials.sessionid || ''
    if (!token) return { valid: false, error: 'Session ID 不能为空' }

    try {
      const valid = await DoubaoProxyAdapter.validateToken(token)
      return valid
        ? { valid: true, tokenType: 'access', accountInfo: { name: 'Doubao User' } }
        : { valid: false, error: 'Session ID 已过期或无效' }
    } catch {
      return { valid: false, error: '验证失败' }
    }
  }

  async refreshToken(): Promise<CredentialInfo | null> {
    return null
  }

  protected async processCallback(_data: OAuthCallbackData): Promise<void> {}
}

export default DoubaoAdapter
