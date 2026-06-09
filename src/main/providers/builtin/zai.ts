import type { BuiltinProviderConfig } from '../../store/types'

export const zaiConfig: BuiltinProviderConfig = {
  id: 'zai',
  name: 'Z.ai',
  type: 'builtin',
  authType: 'jwt',
  apiEndpoint: 'https://chat.z.ai/api',
  chatPath: '/v1/chat/completions',
  headers: {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'Cache-Control': 'no-cache',
    'Origin': 'https://chat.z.ai',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="144", "Not(A:Brand";v="8", "Google Chrome";v="144"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  },
  enabled: true,
  description: 'Z.ai - Free AI Chatbot powered by GLM-5',
  supportedModels: [
    'glm-5',
  ],
  modelMappings: {
    'glm-5': 'glm-5',
    'GLM-5': 'glm-5',
    'glm-5.1': 'glm-5',
    'GLM-5.1': 'glm-5',
    'glm-5-turbo': 'glm-5',
    'GLM-5-Turbo': 'glm-5',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'Access Token',
      type: 'password',
      required: true,
      placeholder: 'Enter Z.ai JWT Token',
      helpText: 'Get token from Z.ai web version, found in browser DevTools Application -> Cookie, starts with "eyJ..."',
    },
  ],
  tokenCheckEndpoint: '/api/v1/users/user/settings',
  tokenCheckMethod: 'GET',
}

export default zaiConfig
