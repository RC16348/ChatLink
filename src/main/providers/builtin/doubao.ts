import type { BuiltinProviderConfig } from '../../store/types'

export const doubaoConfig: BuiltinProviderConfig = {
  id: 'doubao',
  name: 'Doubao (豆包)',
  type: 'builtin',
  authType: 'token',
  apiEndpoint: 'https://www.doubao.com',
  chatPath: '/samantha/chat/completion',
  headers: {
    'Content-Type': 'application/json',
  },
  enabled: true,
  description:
    '字节跳动豆包 AI，内置直连，无需额外服务。填写从豆包网页版 Cookie 中获取的 sessionid 即可使用。支持多轮对话、联网搜索。',
  supportedModels: ['doubao'],
  modelMappings: {
    doubao: 'doubao',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'Session ID',
      type: 'password',
      required: true,
      placeholder: '输入从豆包网页版获取的 sessionid',
      helpText:
        '登录 www.doubao.com 后，在浏览器开发者工具 Application > Cookies 中复制 sessionid 的值',
    },
  ],
}

export default doubaoConfig
