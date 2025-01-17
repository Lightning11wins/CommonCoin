
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');
const { TOKEN } = require('./secrets');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Configs.
const ALLOWED_DECIMALS = 2;
const BACKUP_INTERVAL = 3600000;
const BACKUP_PATH = 'backups';
const BALTOP_PLACES = 5;
const DB_FILEPATH = 'accounts.json';
const LOG_CHANNEL_ID = '1327831162558615602';
const botId = '1329578684960739359';

// In memory.
let bank = undefined;
let busy = undefined;
let logChannel = undefined;

// Helpers.
const magnitude = (10 ** ALLOWED_DECIMALS);
const toNumber = (amount) => Math.round(Number(amount) * magnitude) / magnitude;
const displayMoney = (amount) => `:coin: **${toNumber(amount).toFixed(ALLOWED_DECIMALS)}**`;

const isAdmin = (id) => {
	const idStr = id.toString();
	return (idStr === '349274318196441088');
};

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
	backup() {
		const now = new Date();
		const filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` +
			`_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}.json`;
		const filepath = path.join(BACKUP_PATH, filename);

		const data = JSON.stringify(this.accounts, null, 2);
		fs.writeFileSync(filepath, data, 'utf8');
		console.log('Backup created');

		return filepath;
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
	busy = new Promise((resolve) => resolveFunc = resolve);

	// Gather info.
	const user = interaction.user, userId = user.id, username = user.globalName;
	const guild = interaction.guild, guildId = guild.id, guildName = guild.name;

	// Parse the command.
	switch (interaction.commandName) {
		case 'whoami': {
			await interaction.reply(`Your Discord UUID is: \`${userId}\``);
			break;
		}
		case 'bal': case 'balance': {
			const param1 = interaction.options.getUser('user');
			const id = (param1 || user).id, username = (param1 || user).globalName;
			const balance = bank.getBal(id, username);
			bank.commit();

			const name = (id === userId || !param1) ? 'Your' : `\`${username}\``;
			await interaction.reply(`${name} balance: ${displayMoney(balance)}`);
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
				await interaction.reply(`Nice try, but ${displayMoney(amount)} is a negative number.`);
				break;
			}
			if (newUserBal < 0) {
				await interaction.reply(`${displayMoney(userBal)} - ${displayMoney(amount)} = ${displayMoney(newUserBal)}! (Going into debt is not allowed)`);
				break;
			}
			if (recipientId === botId) {
				await interaction.reply('Sorry, you can\'t send money to the economy bot.');
				break;
			}

			// Make the transaction.
			bank.setBal(userId, newUserBal);
			bank.setBal(recipientId, newRecipientBal);
			bank.commit();

			// Logging.
			const logPromise = log(`${guildName} (${guildId}): \`${username}\` (${userId}) payed ${displayMoney(amount)} to \`${recipientUsername}\` (${recipientId})`);
			await interaction.reply(`SUCCESS: Transferred ${displayMoney(amount)} from \`${username}\` (${userId}) to \`${recipientUsername}\` (${recipientId}). You now have ${displayMoney(newUserBal)}.`);
			await logPromise;
			break;
		}
		case 'mint': {
			if (!isAdmin(userId)) {
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
		case 'baltop': case 'top': case 'leaderboard': {
			const leaderboard = (await Promise.all(
				Object.entries(bank.accounts)
					.sort(([, a], [, b]) => b - a) // Sort by values in descending order
					.slice(0, BALTOP_PLACES)
					.map(async ([id, bal], i) => {
						let name = id;
						try {
							name = (await client.users.fetch(id)).globalName;
							if (name == null) {
								name = 'CommonCoin';
							}
						} catch (error) {
							console.error(`Could not fetch user with ID ${id}`);
						}
						return `> ${i+1}. ${displayMoney(bal)}: \`${name}\``;
					})
			)).join('\n');

			await interaction.reply('### Baltop Leaderboard\n' + leaderboard);
			break;
		}
		case 'backup': {
			if (!isAdmin(userId)) {
				await interaction.reply('Really?');
				break;
			}

			const backupName = bank.backup();
			await interaction.reply(`Backup created: \`${backupName}\``);
			break;
		}
		case 'exit': {
			if (!isAdmin(userId)) {
				await interaction.reply('I\'d rather not, to be honest.');
				break;
			}

			throw new Error(`Process terminated by \`${username}\` (${userId}).`);
		}
	}

	// Allow bot execution to continue.
	busy = undefined;
	resolveFunc();
});

client.login(TOKEN).then();

setInterval(() => bank.backup(), BACKUP_INTERVAL);
