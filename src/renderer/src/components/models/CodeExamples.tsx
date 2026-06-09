import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProxyStore } from '@/stores/proxyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProvidersStore } from '@/stores/providersStore'
import { useToast } from '@/hooks/use-toast'
import { Copy, Check, Code, Terminal, Globe, Key, Settings } from 'lucide-react'

interface ModelOption {
  value: string
  label: string
}

type CodeLang = 'curl' | 'python' | 'nodejs'

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({ title: t('models.copied'), description: t('models.copiedDesc') })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' })
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? t('models.copied') : t('models.copyCode')}
    </Button>
  )
}

function CodeBlock({ code, lang }: { code: string; lang: CodeLang }) {
  return (
    <div className="relative">
      <div className="absolute top-3 right-3 z-10">
        <CopyButton text={code} />
      </div>
      <pre className="bg-zinc-950 text-zinc-50 p-5 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
        <code className={`language-${lang === 'nodejs' ? 'javascript' : lang}`}>{code}</code>
      </pre>
    </div>
  )
}

export function CodeExamples() {
  const { t } = useTranslation()
  const { proxyConfig, proxyStatus } = useProxyStore()
  const { config } = useSettingsStore()
  const { providers, accounts } = useProvidersStore()

  const [selectedModel, setSelectedModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [stream, setStream] = useState(true)

  // Build model options from active providers with real accounts
  const modelOptions = useMemo<ModelOption[]>(() => {
    const options: ModelOption[] = []

    for (const provider of providers) {
      if (!provider.enabled) continue

      const providerAccounts = accounts.filter(a => a.providerId === provider.id)
      const hasActive = providerAccounts.some(a => a.status === 'active')
      if (!hasActive) continue

      for (const model of provider.supportedModels || []) {
        if (!options.find(o => o.value === model)) {
          options.push({ value: model, label: `${model} (${provider.name})` })
        }
      }
    }

    return options
  }, [providers, accounts])

  // Auto-select first model if none selected
  useEffect(() => {
    if (!selectedModel && modelOptions.length > 0) {
      setSelectedModel(modelOptions[0].value)
    }
  }, [modelOptions, selectedModel])

  // Get current proxy info
  const proxyHost = proxyConfig.host || '127.0.0.1'
  const proxyPort = proxyConfig.port || 8080
  const baseUrl = `http://${proxyHost}:${proxyPort}`

  // API Key info
  const apiKeyEnabled = config?.enableApiKey || false
  const activeApiKey = apiKeyEnabled
    ? config?.apiKeys?.find((k: any) => k.enabled)?.key
    : ''
  const hasApiKey = apiKeyEnabled && !!activeApiKey

  // Current model (from dropdown or custom input)
  const currentModel = customModel || selectedModel || 'gpt-3.5-turbo'

  // Generate code for each language
  const generateCode = useCallback((lang: CodeLang): string => {
    const messages = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ])

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (hasApiKey && activeApiKey) {
      headers['Authorization'] = `Bearer ${activeApiKey}`
    }

    const bodyObj: Record<string, any> = {
      model: currentModel,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ],
    }
    if (stream) {
      bodyObj['stream'] = true
    }
    const body = JSON.stringify(bodyObj, null, 2)

    switch (lang) {
      case 'curl': {
        let cmd = `curl -X POST "${baseUrl}/v1/chat/completions" \\\n`
        cmd += `  -H "Content-Type: application/json"`
        if (hasApiKey && activeApiKey) {
          cmd += ` \\\n  -H "Authorization: Bearer ${activeApiKey}"`
        }
        cmd += ` \\\n  -d '${body.replace(/'/g, "\\'")}'`
        if (stream) {
          cmd += ` \\\n  --no-buffer`
        }
        return cmd
      }

      case 'python': {
        const pyHeaders = JSON.stringify(headers, null, 4)
        // Replace JSON booleans with Python booleans
        const pyBody = body.replace(/: true/g, ': True').replace(/: false/g, ': False').replace(/: null/g, ': None')
        let code = `import requests\n\n`
        code += `url = "${baseUrl}/v1/chat/completions"\n\n`
        code += `headers = ${pyHeaders}\n\n`
        code += `data = ${pyBody}\n\n`
        code += `response = requests.post(url, headers=headers, json=data`
        if (stream) {
          code += `, stream=True)\n\n`
          code += `for line in response.iter_lines():\n`
          code += `    if line:\n`
          code += `        line = line.decode("utf-8")\n`
          code += `        if line.startswith("data: "):\n`
          code += `            data_str = line[6:]\n`
          code += `            if data_str == "[DONE]":\n`
          code += `                break\n`
          code += `            import json\n`
          code += `            chunk = json.loads(data_str)\n`
          code += `            delta = chunk.get("choices", [{}])[0].get("delta", {})\n`
          code += `            if "content" in delta:\n`
          code += `                print(delta["content"], end="", flush=True)`
        } else {
          code += `)\n\n`
          code += `result = response.json()\n`
          code += `print(result["choices"][0]["message"]["content"])`
        }
        return code
      }

      case 'nodejs': {
        const jsHeaders = JSON.stringify(headers, null, 2)
        let code = `const BASE_URL = "${baseUrl}";\n`
        if (hasApiKey && activeApiKey) {
          code += `const API_KEY = "${activeApiKey}";\n`
        }
        code += `\n`
        code += `async function chat() {\n`
        code += `  const headers = ${jsHeaders};\n\n`
        code += `  const body = ${body};\n\n`
        code += `  const response = await fetch(\`\${BASE_URL}/v1/chat/completions\`, {\n`
        code += `    method: "POST",\n`
        code += `    headers,\n`
        code += `    body: JSON.stringify(body),\n`
        code += `  });\n\n`
        if (stream) {
          code += `  const reader = response.body.getReader();\n`
          code += `  const decoder = new TextDecoder();\n`
          code += `  let buffer = "";\n\n`
          code += `  while (true) {\n`
          code += `    const { done, value } = await reader.read();\n`
          code += `    if (done) break;\n`
          code += `    buffer += decoder.decode(value, { stream: true });\n`
          code += `    const lines = buffer.split("\\n");\n`
          code += `    buffer = lines.pop() || "";\n`
          code += `    for (const line of lines) {\n`
          code += `      if (line.startsWith("data: ")) {\n`
          code += `        const data = line.slice(6);\n`
          code += `        if (data === "[DONE]") return;\n`
          code += `        const chunk = JSON.parse(data);\n`
          code += `        const delta = chunk.choices?.[0]?.delta;\n`
          code += `        if (delta?.content) {\n`
          code += `          process.stdout.write(delta.content);\n`
          code += `        }\n`
          code += `      }\n`
          code += `    }\n`
          code += `  }\n`
        } else {
          code += `  const result = await response.json();\n`
          code += `  console.log(result.choices[0].message.content);\n`
        }
        code += `}\n\n`
        code += `chat().catch(console.error);`
        return code
      }

      default:
        return ''
    }
  }, [baseUrl, currentModel, stream, hasApiKey, activeApiKey])

  const [codeTab, setCodeTab] = useState<CodeLang>('curl')

  return (
    <div className="space-y-6">
      {/* Config Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5" />
            {t('models.currentConfig')}
          </CardTitle>
          <CardDescription>{t('models.currentConfigDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('models.proxyEndpoint')}</p>
                <code className="text-sm font-mono">{baseUrl}</code>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">API 基础路径</p>
                <code className="text-sm font-mono">{baseUrl}/v1</code>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Key className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('models.apiKeyStatus')}</p>
                {hasApiKey ? (
                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                    {t('models.apiKeyActive')}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                    {t('models.apiKeyInactive')}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Code className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('models.outputMode')}</p>
                <Badge variant="secondary" className="text-xs">
                  {stream ? '流式输出' : '非流式'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('models.selectModel')}</CardTitle>
          <CardDescription>{t('models.selectModelDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                {t('models.availableModels')}
              </label>
              <Select value={customModel ? '__custom__' : selectedModel} onValueChange={(v) => {
                if (v === '__custom__') {
                  setCustomModel(selectedModel || '')
                  setSelectedModel('')
                } else {
                  setSelectedModel(v)
                  setCustomModel('')
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('models.selectModelPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">{t('models.customModel')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {customModel !== '' || (!selectedModel && modelOptions.length === 0) ? (
              <div>
                <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                  {t('models.customModelName')}
                </label>
                <Input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="输入自定义模型名称..."
                />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Code Examples */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Code className="h-5 w-5" />
                {t('models.codeExamples')}
              </CardTitle>
              <CardDescription>{t('models.codeExamplesDesc')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={stream ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStream(!stream)}
              >
                {stream ? t('models.streaming') : t('models.nonStreaming')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={codeTab} onValueChange={(v) => setCodeTab(v as CodeLang)}>
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="curl" className="flex items-center gap-2 py-2">
                <Terminal className="h-4 w-4" />
                cURL
              </TabsTrigger>
              <TabsTrigger value="python" className="flex items-center gap-2 py-2">
                <Code className="h-4 w-4" />
                Python
              </TabsTrigger>
              <TabsTrigger value="nodejs" className="flex items-center gap-2 py-2">
                <Globe className="h-4 w-4" />
                Node.js
              </TabsTrigger>
            </TabsList>

            <TabsContent value="curl" className="mt-4">
              <CodeBlock code={generateCode('curl')} lang="curl" />
            </TabsContent>
            <TabsContent value="python" className="mt-4">
              <CodeBlock code={generateCode('python')} lang="python" />
            </TabsContent>
            <TabsContent value="nodejs" className="mt-4">
              <CodeBlock code={generateCode('nodejs')} lang="nodejs" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

export default CodeExamples
