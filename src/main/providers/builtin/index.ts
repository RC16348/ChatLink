import glmConfig from './glm'
import kimiConfig from './kimi'
import minimaxConfig from './minimax'
import mimoConfig from './mimo'
import perplexityConfig from './perplexity'
import qwenConfig from './qwen'
import qwenAiConfig from './qwen-ai'
import zaiConfig from './zai'
import doubaoConfig from './doubao'
import type { BuiltinProviderConfig } from '../../store/types'

export const builtinProviders: BuiltinProviderConfig[] = [
  glmConfig,
  kimiConfig,
  minimaxConfig,
  mimoConfig,
  perplexityConfig,
  qwenConfig,
  qwenAiConfig,
  zaiConfig,
  doubaoConfig,
]

export const builtinProviderMap: Record<string, BuiltinProviderConfig> = {
  glm: glmConfig,
  kimi: kimiConfig,
  minimax: minimaxConfig,
  mimo: mimoConfig,
  perplexity: perplexityConfig,
  qwen: qwenConfig,
  'qwen-ai': qwenAiConfig,
  zai: zaiConfig,
  doubao: doubaoConfig,
}

export function getBuiltinProvider(id: string): BuiltinProviderConfig | undefined {
  return builtinProviderMap[id]
}

export function getBuiltinProviders(): BuiltinProviderConfig[] {
  return builtinProviders
}

export {
  glmConfig,
  kimiConfig,
  minimaxConfig,
  mimoConfig,
  perplexityConfig,
  qwenConfig,
  qwenAiConfig,
  zaiConfig,
  doubaoConfig,
}

export default builtinProviders
