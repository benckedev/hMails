const EventEmitter = require('events'),
    hInventory = require('inventory/api/Inventory.js')


class Mail extends EventEmitter {
    #mongo
    #userID
    #options
    constructor(userID, mongo, options = { inventory: Object, debug: false }) {
        super()


        this.#userID = userID

        this.#mongo = mongo

        this.#options = { ...options }
    }

    /**
     * Method to create a user mail in database
     * @returns {Promise}
     */
    async create() {
        try {
            this.emit('mailCreate', { userID: this.#userID })

            const mailHas = await this.has()

            if (mailHas) throw new Error("User already has a mail.")

            return await this.#mongo.set(`mails.${this.#userID}`, {
                unread: [],
                read: []
            })

        } catch (error) {
            this.emit('error', { function: 'create', error: error.message, userID: this.#userID })
        }
    }

    /**
     * Check if user mail is in database
     * @returns {Promise | Boolean}
     */
    async has() {
        try {
            this.emit('mailHas', { userID: this.#userID })
            return await this.#mongo.has(`mails.${this.#userID}`)
        } catch (error) {
            this.emit('error', { function: 'has', error: error.message, userID: this.#userID })
        }
    }

    /**
     * Fetch user mail database
     * @returns {Promise | Object}
     */
    async get() {
        try {
            this.emit('mailHas', { userID: this.#userID })
            return await this.#mongo.fetch(`mails.${this.#userID}`)
        } catch (error) {
            this.emit('error', { function: 'get', error: error.message, userID: this.#userID })
        }
    }

    /**
     * Get mail from user database
     * @param {Number | String} mailID 
     * @param {Boolean} options.readed
     * @returns {Promise | Object}
     */
    async fetch(mailID, options = { unreaded: false, readed: false }) {
        try {

            const mailData = await this.get()

            let mailBox;

            switch (options) {
                case options.unreaded:
                    mailBox = mailData.unreaded
                    break
                case options.readed:
                    mailBox = mailData.readed
                    break
                default:
                    mailBox = [...mailData.read, ...mailData.unread]
            }

            const mailPosition = mailBox.findIndex(mail => mail.id == mailID)

            if (mailPosition === -1) throw new Error("Invalid mail id.")

            const mailInfo = { mail: mailBox[mailPosition], readed: mailData.read, unreaded: mailData.unread }

            this.emit('mailFetch', { userID: this.#userID, mailID: mailID })

            return {
                ...mailInfo,
                read: async () => {
                    return await this.read(mailInfo)
                },
                collect: async () => { return await this.collect(mailInfo) }
            }
        } catch (error) {
            this.emit('error', { function: 'mail', error: error.message, userID: this.#userID, mailID: mailID })
        }
    }

    /**
     * Create a mail to send to the user
     * @param {Object} mailConstructor 
     * @returns {Promise | Object}
     */
    async send(mailConstructor = { character: Object, message: String, reward: Array }) {
        try {
            const mailData = await this.get(),
                mailID = 1000 + ((mailData.unread.length + mailData.read.length) + 1)
            mailConstructor = {
                id: mailID,
                ...mailConstructor
            }

            this.emit('mailSend', { userID: this.#userID, ...mailConstructor })

            return await this.#mongo.push(`mails.${this.#userID}.unread`, mailConstructor)
        } catch (error) {
            this.emit('error', { function: 'send', error: error.message, userID: this.#userID })
        }
    }

    /**
     * Remove a mail from the unread box and send to readed mails
     * @param {Object | String} mail 
     * @returns {Promise}
     */
    async read(mail) {
        try {
            const mailReadPosition = mail.readed.findIndex(i => i.id == mail.mail.id)
            if (mailReadPosition !== -1) throw new Error("This mail has been readed before.")

            const mailUnreadPosition = mail.unreaded.findIndex(i => i.d === mail.mail.id)

            await this.#mongo.removeElement(`mails.${this.#userID}.unread`, mailUnreadPosition)

            await this.#mongo.push(`mails.${this.#userID}.read`, mail.mail)

            this.emit('mailRead', { userID: this.#userID, mailID: mail.mail.id })
        } catch (error) {
            this.emit('error', { function: 'read', error: error.message, userID: this.#userID, mailID: mail.mail.id })
        }
        return 0
    }

    /**
     * Collect rewards from a mail
     * @param {Object} mail 
     * @returns {Promise | Boolean}
     */
    async collect(mail) {
        try {
            const mailReward = mail.reward
            if (!mailReward) throw new Error("This mail don't have reward to collect")

            const rewardCount = mail.reward.length

            // InventoryAPI
            const userInventory = new hInventory({ inventory: this.#options.inventory }),
                inventoryCompare = await userInventory.compare({
                    arrayOfItems: mailReward
                })

            if (!inventoryCompare) throw new Error("The user don't have space to collect items")

            mail.reward.forEach(async reward => {
                await this.#options.inventory.add(reward)
            })

            return true

        } catch (error) {
            this.emit('error', { function: 'collect', error: error.message, userID: this.#userID, mailID: mail.id })
            return false
        }
    }
}

module.exports = Mail