/**
 * OAuth Adapter Index
 * Export all provider authentication adapters
 */

export { BaseOAuthAdapter } from './base'
export { GLMAdapter } from './glm'
export { KimiAdapter } from './kimi'
export { MimoAdapter } from './mimo'
export { MiniMaxAdapter } from './minimax'
export { PerplexityAdapter } from './perplexity'
export { QwenAdapter } from './qwen'
export { QwenAiAdapter } from './qwen-ai'
export { ZaiAdapter } from './zai'
export { DoubaoAdapter } from './doubao'
import { BaseOAuthAdapter } from './base'
import { GLMAdapter } from './glm'
import { KimiAdapter } from './kimi'
import { MimoAdapter } from './mimo'
import { MiniMaxAdapter } from './minimax'
import { PerplexityAdapter } from './perplexity'
import { QwenAdapter } from './qwen'
import { QwenAiAdapter } from './qwen-ai'
import { ZaiAdapter } from './zai'
import { DoubaoAdapter } from './doubao'
import { ProviderType, AdapterConfig } from '../types'

/**
 * Adapter factory function
 */
export function createAdapter(
  providerType: ProviderType,
  config: AdapterConfig
): BaseOAuthAdapter {
  switch (providerType) {
    case 'glm':
      return new GLMAdapter(config)
    case 'kimi':
      return new KimiAdapter(config)
    case 'mimo':
      return new MimoAdapter(config)
    case 'minimax':
      return new MiniMaxAdapter(config)
    case 'perplexity':
      return new PerplexityAdapter(config)
    case 'qwen':
      return new QwenAdapter(config)
    case 'qwen-ai':
      return new QwenAiAdapter(config)
    case 'zai':
      return new ZaiAdapter(config)
    case 'doubao':
      return new DoubaoAdapter(config)
    default:
      throw new Error(`Unsupported provider type: ${providerType}`)
  }
}

/**
 * Get supported authentication methods for provider
 */
export function getSupportedAuthMethods(providerType: ProviderType): string[] {
  switch (providerType) {
    case 'glm':
      return ['manual']
    case 'kimi':
      return ['manual']
    case 'mimo':
      return ['manual', 'cookie']
    case 'minimax':
      return ['manual']
    case 'perplexity':
      return ['manual', 'cookie']
    case 'qwen':
      return ['manual', 'cookie']
    case 'qwen-ai':
      return ['manual']
    case 'zai':
      return ['manual']
    case 'doubao':
      return ['manual', 'cookie']
    default:
      return ['manual']
  }
}
