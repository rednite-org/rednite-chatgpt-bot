import winston from 'winston'
import moment from 'moment'

const { format } = winston

const logger = winston.createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(log => {
            const date = moment(log.timestamp)

            return `[${date.format('YYYY-MM-DD hh:mm:ss')}] ${log.message}`
        })
    ),
    transports: [
        new winston.transports.Console()
    ]
})


export default logger
