import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ModelSelector } from './ModelSelector'
import { MessageSquare, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ChatMain() {
  const { t } = useTranslation()
  const activeId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const models = useChatStore((s) => s.models)
  const modelsLoading = useChatStore((s) => s.modelsLoading)
  const modelsError = useChatStore((s) => s.modelsError)
  const fetchModels = useChatStore((s) => s.fetchModels)
  const updateConversationModel = useChatStore((s) => s.updateConversationModel)
  const createConversation = useChatStore((s) => s.createConversation)
  const config = useSettingsStore((s) => s.config)

  const conversation = conversations.find((c) => c.id === activeId)

  useEffect(() => {
    if (config) {
      fetchModels()
    }
  }, [fetchModels, config])

  // Empty state - no active conversation
  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          {/* Error state - models failed to load */}
          {modelsError ? (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-destructive">无法连接代理服务</h3>
                <p className="text-sm text-muted-foreground mt-2">{modelsError}</p>
              </div>
              <Button variant="outline" onClick={fetchModels} disabled={modelsLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${modelsLoading ? 'animate-spin' : ''}`} />
                {t('common.retry')}
              </Button>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium">{t('chat.noConversations')}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t('chat.noConversationsDesc')}</p>
              </div>
              {models.length > 0 && (
                <Button onClick={() => createConversation(models[0].id)}>
                  {t('chat.startNewChat')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background/50">
        <ModelSelector
          model={conversation.model}
          onModelChange={(model) => updateConversationModel(conversation.id, model)}
        />
      </div>

      {/* Messages */}
      <MessageList />

      {/* Input */}
      <ChatInput conversationId={conversation.id} />
    </div>
  )
}
