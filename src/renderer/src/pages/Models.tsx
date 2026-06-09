import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEffect, useRef } from 'react'
import { ModelList, CodeExamples } from '@/components/models'
import { useProxyStore } from '@/stores/proxyStore'
import { Database, Code } from 'lucide-react'

export function Models() {
  const { t } = useTranslation()
  const { fetchAppConfig } = useProxyStore()
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchAppConfig()
  }, [fetchAppConfig])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('models.title')}</h2>
        <p className="text-muted-foreground">{t('models.description')}</p>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="list" className="flex items-center gap-2 py-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">{t('models.modelList')}</span>
          </TabsTrigger>
          <TabsTrigger value="examples" className="flex items-center gap-2 py-2">
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">{t('models.codeExamples')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <ModelList />
        </TabsContent>

        <TabsContent value="examples" className="mt-6">
          <CodeExamples />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Models
