
import storage from 'node-persist'
import throttle from 'lodash/throttle'
import { ChatGPTAPI } from 'chatgpt'
import { marked } from 'marked'
import { Telegraf, Telegram } from 'telegraf'
import { adminUser, botToken, openaiApiKey } from './config'
import logger from './logger'


// 3 min 
const handlerTimeout = 1000 * 60 * 3

async function main() {

    const chatGptApi = new ChatGPTAPI({
        apiKey: openaiApiKey
    })


    const bot = new Telegraf(botToken, {
        handlerTimeout,
    })

    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))

    logger.info('🔧 Init storage...')
    await storage.init({
        dir: './data',
    })

    logger.info('🔧 Setup commands...')
    await setupCommands(bot.telegram)


    const me = await bot.telegram.getMe()


    logger.info('🔧 Register message handler...')

    const sayRegex = new RegExp(`^\\/say(@${me.username})?`)
    bot.command('say', async ctx => {
        const text = ctx.message.text.replace(sayRegex, "").trim()

        const { from, chat } = ctx

        const userInfo = `@${from.username} (${from.id})`
        const chatInfo = chat.type === 'private'
            ? 'private chat'
            : `group ${chat.title} (${chat.id})`


        logger.info(`📩 Message from ${userInfo} in ${chatInfo}:\n${text}`)

        if (chat.type === 'private') {
            const allowedUsers: Number[] = (await storage.get('allowed_users')) || []

            if (!allowedUsers.includes(from.id)) {
                await ctx.reply('⛔️ Простите, но вы не имеете права на выполнение этой команды или общение со мной.', {
                    reply_to_message_id: ctx.message.message_id
                })

                return
            }
        } else {
            const allowedGroups: Number[] = (await storage.get('allowed_groups')) || []

            if (!allowedGroups.includes(chat.id)) {
                logger.info(`⚠️ Authentication failed for ${chatInfo}`)

                await ctx.reply("⛔️ Извините, мне не разрешено работать здесь. Пожалуйста, удалите меня из группы.", {
                    reply_to_message_id: ctx.message.message_id
                })
                return
            }
        }

        let reply: { chatId: number, messageId: number } | null = null

        const updateMessage = async (markdown: string) => {
            const html = marked.parseInline(markdown)

            // Send first message if not exist
            if (!reply) {
                const res = await ctx.reply(html, {
                    reply_to_message_id: ctx.message.message_id,
                    parse_mode: 'HTML'
                })

                reply = {
                    chatId: res.chat.id,
                    messageId: res.message_id
                }

                return
            }

            return bot.telegram.editMessageText(
                reply.chatId,
                reply.messageId,
                undefined,
                html,
                { parse_mode: 'HTML' }
            )
        }

        ctx.sendChatAction('typing')
        const typingInterval = setInterval(() => ctx.sendChatAction('typing'), 4000)

        let partialText = ""
        const textHandler = throttle((partial) => {
            if (partialText === partial.text) return
            updateMessage(partial.text)

            partialText = partial.text
        }, 2000)


        const storageKey = chat.type === 'private' ? `user_${from.id}` : `group_${chat.id}`

        const parentMessageId: string = await storage.get(storageKey) 

        const res = await chatGptApi.sendMessage(text, {
            parentMessageId,
            onProgress: (partial) => textHandler(partial)
        })

        await storage.set(storageKey, res.parentMessageId)

        clearInterval(typingInterval)
    })

    bot.command('add_group', async ctx => {
        const { from, chat } = ctx

        const userInfo = `@${from.username} (${from.id})`
        const chatInfo = chat.type === 'private'
            ? 'private chat'
            : `group ${chat.title} (${chat.id})`


        logger.info(`📩 Command "add_group" from ${userInfo} in ${chatInfo}`)

        if (from.id !== adminUser) {
            logger.info(`⚠️ Authentication failed for ${from.username} in ${chatInfo}`)
            await ctx.reply('⛔️ Извините, эта команда доступна только администратору')

            return
        }

        if (chat.type === 'private') {
            await ctx.reply('⛔️ Извините, эта команда не доступна в личной переписке')

            return
        }

        const allowedGroups: Number[] = (await storage.get('allowed_groups')) || []
        allowedGroups.push(chat.id)
        
        await storage.set('allowed_groups', allowedGroups)

        await ctx.reply('✅ Теперь мне разрешено писать сюда')

    })


    const addUserRegex = new RegExp(`^\\/add_user(@${me.username})?`)
    bot.command('add_user', async ctx => {
        const text = ctx.message.text.replace(addUserRegex, "").trim()

        const { from, chat } = ctx

        const userInfo = `@${from.username} (${from.id})`
        const chatInfo = chat.type === 'private'
            ? 'private chat'
            : `group ${chat.title} (${chat.id})`


        logger.info(`📩 Command "add_user" from ${userInfo} in ${chatInfo}`)

        if (from.id !== adminUser) {
            logger.info(`⚠️ Authentication failed for ${from.username} in ${chatInfo}`)
            await ctx.reply('⛔️ Извините, эта команда доступна только администратору')

            return
        }

        try {
            const userId = parseInt(text)

            const allowedUsers: Number[] = (await storage.get('allowed_users')) || []

            allowedUsers.push(userId)

            await storage.set('allowed_users', allowedUsers)

            await ctx.reply('✅ Пользователь добавлен')

        } catch (err) {
            await ctx.reply('⛔️ Произошла ошибка. Проверьте правильно ввода параметров')

            return
        }
    })


    bot.command('reset', async ctx => {
        const { from, chat } = ctx

        const userInfo = `@${from.username} (${from.id})`
        const chatInfo = chat.type === 'private'
            ? 'private chat'
            : `group ${chat.title} (${chat.id})`


        logger.info(`📩 Command "reset" from ${userInfo} in ${chatInfo}`)
        
        const storageKey = chat.type === 'private' ? `user_${from.id}` : `group_${chat.id}`

        await storage.removeItem(storageKey)

        logger.info(`🤖 Bot @${me.username} is starting...`)
    
        await ctx.reply('🔄 Диалог очищен.')
    })




    await bot.launch()
}



export async function setupCommands(telegram: Telegram) {
    await telegram.setMyCommands([
        {
            command: `/say`,
            description: 'Отправить сообщение боту'
        },
        {
            command: '/reset',
            description: 'Начать новый диалог'
        }
    ])
}

main().catch(console.error)