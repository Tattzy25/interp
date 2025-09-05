import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LLMModel, LLMModelConfig } from '@/lib/models'
import { TemplateId, Templates } from '@/lib/templates'
import 'core-js/features/object/group-by.js'
import { Sparkles } from 'lucide-react'
import Image from 'next/image'

export function ChatPicker({
  templates,
  selectedTemplate,
  onSelectedTemplateChange,
  models,
  languageModel,
  onLanguageModelChange,
  userTier = 'free', // Added user tier prop
  hasApiKey = false, // Added API key prop
}: {
  templates: Templates
  selectedTemplate: 'auto' | TemplateId
  onSelectedTemplateChange: (template: 'auto' | TemplateId) => void
  models: LLMModel[]
  languageModel: LLMModelConfig
  onLanguageModelChange: (config: LLMModelConfig) => void
  userTier?: 'free' | 'pro' | 'premium'
  hasApiKey?: boolean
}) {
  const showAdvancedControls = userTier === 'premium' || hasApiKey
  
  return (
    <div className="flex items-center space-x-2">
      <div className="flex flex-col">
        <Select
          name="template"
          defaultValue={selectedTemplate}
          onValueChange={onSelectedTemplateChange}
        >
          <SelectTrigger className="whitespace-nowrap border-none shadow-none focus:ring-0 px-0 py-0 h-6 text-xs">
            <SelectValue placeholder="Select a persona" />
          </SelectTrigger>
          <SelectContent side="top">
            <SelectGroup>
              <SelectLabel>Code Homie Personas</SelectLabel>
              <SelectItem value="auto">
                <div className="flex items-center space-x-2">
                  <img 
                    src="https://i.imgur.com/YjlgFGU.png" 
                    alt="Code Homie" 
                    className="w-3.5 h-3.5"
                  />
                  <span>Use Code Homie</span>
                </div>
              </SelectItem>
              {Object.entries(templates).map(([templateId, template]) => (
                <SelectItem key={templateId} value={templateId}>
                  <div className="flex items-center space-x-2">
                    <Image
                      className="flex"
                      src={`/thirdparty/templates/${templateId}.svg`}
                      alt={templateId}
                      width={14}
                      height={14}
                    />
                    <span>{template.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      
      {showAdvancedControls && (
        <div className="flex flex-col">
          <Select
            name="languageModel"
            defaultValue={languageModel.model}
            onValueChange={(e) => onLanguageModelChange({ model: e })}
          >
            <SelectTrigger className="whitespace-nowrap border-none shadow-none focus:ring-0 px-0 py-0 h-6 text-xs">
              <SelectValue placeholder="Language model" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(
                Object.groupBy(models, ({ provider }) => provider),
              ).map(([provider, models]) => (
                <SelectGroup key={provider}>
                  <SelectLabel>{provider}</SelectLabel>
                  {models?.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center space-x-2">
                        <Image
                          className="flex"
                          src={`/thirdparty/logos/${model.providerId}.svg`}
                          alt={model.provider}
                          width={14}
                          height={14}
                        />
                        <span>{model.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {!showAdvancedControls && (
        <div className="text-xs text-muted-foreground px-2">
          {hasApiKey ? 'Using your API key' : 'Powered by Code Homie'}
        </div>
      )}
    </div>
  )
}
