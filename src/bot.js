
const fs = require('node:fs');
const { Client, GatewayIntentBits } = require('discord.js');
const { TOKEN } = require('./secrets');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Configs.
const BACKUP_PATH = 'backups';
const DB_FILEPATH = 'accounts.json';
const LOG_CHANNEL_ID = '1327831162558615602';
const ALLOWED_DECIMALS = 2;

// In memory.
let bank = undefined;
let busy = undefined;
let logChannel = undefined;

// Helpers.
const magnitude = (10 ** ALLOWED_DECIMALS);
const toNumber = (amount) => Math.round(Number(amount) * magnitude) / magnitude;
const displayMoney = (amount) => `:coin: **${toNumber(amount)}**`;

// Log.
const log = async (msg) => {
	console.log('LOG: ' + msg);
	try {
		await logChannel.send(msg);
	} catch (error) {
		console.error('Could not send message to the channel:', error);
	}
};

class Bank {
	constructor() {
		try {
			const data = fs.readFileSync(DB_FILEPATH, 'utf8');
			const accounts = this.accounts = JSON.parse(data);
			Object.keys(accounts).forEach(userId => {
				accounts[userId] = toNumber(accounts[userId]);
			});
			this.commit();
		} catch (error) {
			console.error('Error reading or parsing the file:', error);
			this.accounts = {};
		}
	}

	getBal(userId, username) {
		const { accounts } = this, id = userId.toString().trim();
		if (accounts[id] === undefined) {
			log(`Added ${username} with balance of $0.00`).then();
			return accounts[id] = 0;
		}
		return accounts[id];
	}
	setBal(userId, newBal) {
		const { accounts } = this, id = userId.toString().trim();
		if (accounts[id] === undefined) {
			throw new Error('Setting nonexistent user ID: ' + id);
		}
		accounts[id] = newBal;
	}
	commit() {
		const data = JSON.stringify(this.accounts, null, 2);
		fs.writeFileSync(DB_FILEPATH, data, 'utf8');
		console.log('Transaction committed');
	}
}

client.once('ready', () => {
	bank = new Bank();
	console.log('Bot is online!');
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) {
		return;
	}

	// Fetch the log channel.
	if (!logChannel) {
		logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
	}

	// Wait for the bot to be ready.
	while (busy) {
		await busy;
	}

	// Lock the bot.
	let resolveFunc;
	busy = new Promise((resolve, reject) => resolveFunc = resolve);

	// Gather info.
	const user = interaction.user, userId = user.id, username = user.globalName;
	const guild = interaction.guild, guildId = guild.id, guildName = guild.name;

	// Parse the command.
	switch (interaction.commandName) {
		case 'whoami': {
			await interaction.reply(`Your Discord UUID is: ${userId}`);
			break;
		}
		case 'bal': {
			const money = bank.getBal(userId, username);
			bank.commit();

			await interaction.reply(`Your balance: ${displayMoney(money)}`);
			break;
		}
		case 'pay': {
			// Recipient info.
			const recipient = interaction.options.getUser('user'), recipientId = recipient.id, recipientUsername = recipient.globalName;
			const amount = toNumber(interaction.options.getNumber('amount'));

			// Calculations.
			const userBal = bank.getBal(userId, username), recipientBal = bank.getBal(recipientId, username);
			const newUserBal = userBal - amount, newRecipientBal = recipientBal + amount;

			// Error checking.
			if (amount <= 0) {
				await interaction.reply(`FAIL: Nice try, but ${displayMoney(amount)} is a negative number.`);
				break;
			}
			if (newUserBal < 0) {
				await interaction.reply(`FAIL: ${displayMoney(userBal)} - ${displayMoney(amount)} = ${displayMoney(newUserBal)}! (Going into debt is not allowed)`);
				break;
			}

			// Make the transaction.
			bank.setBal(userId, newUserBal);
			bank.setBal(recipientId, newRecipientBal);
			bank.commit();

			// Logging.
			const logPromise = log(`${guildName} (${guildId}): ${username} (${userId}) payed ${displayMoney(amount)} to ${recipientUsername} (${recipientId})`);
			await interaction.reply(`SUCCESS: Transferred ${displayMoney(amount)} from **${username}** (${userId}) to **${recipientUsername}** (${recipientId}). You now have ${displayMoney(newUserBal)}.`);
			await logPromise;
			break;
		}
		case 'mint': {
			if (userId.toString() !== '349274318196441088') {
				await interaction.reply('no lol :)');
				break;
			}

			// Calculations.
			const amount = toNumber(interaction.options.getNumber('amount'));
			const userBal = bank.getBal(userId, username), newBal = userBal + amount;

			// Make the transaction.
			bank.setBal(userId, newBal);
			bank.commit();

			// Logging.
			const logPromise = log(`${guildName} (${guildId}): ${username} (${userId}) minted ${displayMoney(amount)} in exchange for diamonds deposited into the vault.`);
			await interaction.reply(`SUCCESS: Minted ${displayMoney(amount)}.`);
			await logPromise;
			break;
		}
		case 'baltop': {
			const leaderboard = (await Promise.all(
				Object.entries(bank.accounts)
					.sort(([, a], [, b]) => b - a) // Sort by values in descending order
					.map(async ([id, bal]) => {
						try {
							const user = await client.users.fetch(id);
							return `${user.globalName}: ${displayMoney(bal)}`;
						} catch (error) {
							console.error(`Could not fetch user with ID ${id}`);
							return `${id}: ${displayMoney(bal)}`;
						}
					})
			)).join('\n');

			await interaction.reply(`### Baltop Leaderboard\n${leaderboard}`);
			break;
		}
	}

	// Allow bot execution to continue.
	busy = undefined;
	resolveFunc();
});

client.login(TOKEN).then(r => console.log('login ended: '+ r));
