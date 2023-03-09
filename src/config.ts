import { config } from 'dotenv'

config()

export const openaiApiKey = getenv('OPENAI_API_KEY')
export const botToken = getenv('BOT_TOKEN')
export const adminUser = Number(getenv('ADMIN_USER'))


function getenv(name: string, defaultValue?: string) {
  const value = process.env[name]

  if (defaultValue === undefined && value === undefined) {
    throw new Error(`You must specify ${name} env`)
  }

  return (value ?? defaultValue) as string
}
