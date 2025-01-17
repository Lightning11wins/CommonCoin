
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');
const { TOKEN } = require('./secrets');
const { deploy } = require('./deploy');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Configs.
const ALLOWED_DECIMALS = 2;
const BACKUP_INTERVAL = 3600000;
const BACKUP_PATH = 'backups';
const BALTOP_PLACES = 5;
const BRANDING_GOLD = 0xf9cc47;
const DB_FILEPATH = 'accounts.json';
const EPHEMERAL = 0b1000000;
const LOG_CHANNEL_ID = '1327831162558615602';
const MAX_REASON_LENGTH = 1024;
const MIN_REASON_LENGTH = 16;
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
	return (
		idStr === '349274318196441088' || // Lightning
		idStr === '973038141428629564'    // Ezran
	);
};

// Function to wait for the db to be ready.
const getLock = async () => {
	// Wait for the bot to be ready.
	while (busy) {
		await busy;
	}

	// Lock the bot.
	let releaseLock;
	busy = new Promise((resolve) => releaseLock = () => { busy = undefined; resolve(); });

	return releaseLock;
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
		this.dirty = false;
		this.needsBackup = false;
	}

	getBal(userId, username) {
		const { accounts } = this, id = userId.toString().trim();
		if (accounts[id] === undefined) {
			this.dirty = true;
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

		this.dirty = true;
		accounts[id] = newBal;
	}
	commit() {
		if (this.dirty) {
			this.dirty = false;
			this.needsBackup = true;

			const data = JSON.stringify(this.accounts, null, 2);
			fs.writeFileSync(DB_FILEPATH, data, 'utf8');
			console.log('Transaction committed, ready for backup.');
		}
	}
	backup() {
		if (this.needsBackup) {
			this.commit();
			this.needsBackup = false;

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
}

client.once('ready', async () => {
	bank = new Bank();
	logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
});

client.on('interactionCreate', async interaction => {
	const startTime = performance.now();
	if (!interaction.isCommand()) {
		return;
	}

	// Gather info.
	const user = interaction.user, userId = user.id, username = user.globalName;
	const guild = interaction.guild, guildId = guild.id, guildName = guild.name;

	// Handle closed beta testing.
	if (!isAdmin(userId)) {
		await interaction.reply({
			embeds: [{
				title: 'Closed Beta Testing',
				description: 'Sorry, the bot is currently in the closed beta testing phase.',
				color: BRANDING_GOLD,
			}],
			flags: EPHEMERAL,
		});
		return;
	}

	// Acquire the bot db lock, which is needed for reads and writes.
	const releaseLock = await getLock();

	// Parse the command.
	switch (interaction.commandName) {
		case 'whoami': {
			await interaction.reply({
				content: `Your Discord UUID is: \`${userId}\``,
				flags: EPHEMERAL,
			});
			break;
		}
		case 'bal': case 'balance': {
			const param1 = interaction.options.getUser('user');
			const id = (param1 || user).id, username = (param1 || user).globalName;
			const balance = bank.getBal(id, username);
			bank.commit();

			const name = (id === userId || !param1) ? 'Your' : `\`${username}\``;
			await interaction.reply({ content: `${name} balance: ${displayMoney(balance)}` });
			break;
		}
		case 'pay': {
			// Recipient info.
			const recipient = interaction.options.getUser('user'), recipientId = recipient.id, recipientUsername = recipient.globalName;
			const amount = toNumber(interaction.options.getNumber('amount'));
			const reason = interaction.options.getString('reason');

			// Calculations.
			const userBal = bank.getBal(userId, username), recipientBal = bank.getBal(recipientId, username);
			const newUserBal = userBal - amount, newRecipientBal = recipientBal + amount;

			// Error checking.
			if (amount <= 0) {
				await interaction.reply({
					embeds: [{
						title: "Transfer Failed",
						description: `Nice try, but ${displayMoney(amount)} is a negative number.`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				break;
			}
			if (newUserBal < 0) {
				await interaction.reply({
					embeds: [{
						title: "Transfer Failed",
						description: `${displayMoney(userBal)} - ${displayMoney(amount)} = ${displayMoney(newUserBal)}! (Going into debt is not allowed)`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				break;
			}
			if (recipientId === botId) {
				await interaction.reply({
					embeds: [{
						title: "Transfer Failed",
						description: 'You cannot send money to the economy bot.',
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				break;
			}
			if (recipientId === userId) {
				await interaction.reply({
					embeds: [{
						title: "Transfer Failed",
						description: 'You cannot send money to yourself.',
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				break;
			}
			if (reason.length < MIN_REASON_LENGTH) {
				await interaction.reply({
					embeds: [{
						title: "Transfer Failed",
						description: `Your reason should be **at least ${MIN_REASON_LENGTH}** characters long.`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				return;
			}
			if (reason.length > MAX_REASON_LENGTH) {
				await interaction.reply({
					embeds: [{
						title: "Transfer Failed",
						description: `Your reason should be **at most ${MAX_REASON_LENGTH}** characters long.`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				return;
			}

			// Make the transaction.
			bank.setBal(userId, newUserBal);
			bank.setBal(recipientId, newRecipientBal);
			bank.commit();

			// Logging.
			const logPromise = log(`${guildName} (${guildId}): \`${username}\` (${userId}) payed ${displayMoney(amount)} to \`${recipientUsername}\` (${recipientId}). Reason: ${reason}`);
			await interaction.reply({
				embeds: [{
					title: "Common Coin Transferred",
					description: [
						`Transferred ${displayMoney(amount)} from \`${username}\` to \`${recipientUsername}\`.`,
						`> **Reason**: ${reason}`,
						`You now have ${displayMoney(newUserBal)}.`,
					].join('\n'),
					color: BRANDING_GOLD,
				}],
			});
			await logPromise;
			break;
		}
		case 'mint': {
			if (!isAdmin(userId)) {
				await interaction.reply({
					content: 'no lol :)',
					flags: EPHEMERAL,
				});
				break;
			}

			// Calculations.
			const recipient = interaction.options.getUser('user'), recipientId = recipient.id, recipientUsername = recipient.globalName;
			const amount = toNumber(interaction.options.getNumber('amount'));
			const userBal = bank.getBal(userId, username), newBal = userBal + amount;

			// Make the transaction.
			bank.setBal(recipientId, newBal);
			bank.commit();

			// Logging.
			const logPromise = log(`${guildName} (${guildId}): ${username} (${userId}) minted ${displayMoney(amount)} for ${recipientUsername} (${recipientId}) in exchange for diamonds deposited into the vault.`);
			await interaction.reply({
				embeds: [{
					title: "Common Coin Minted",
					description: `Minted ${displayMoney(amount)} for ${recipientUsername}.`,
					color: BRANDING_GOLD,
				}],
			});
			await logPromise;
			break;
		}
		case 'baltop': case 'top': case 'leaderboard': {
			const leaderboard = (await Promise.all(
				Object.entries(bank.accounts)
					.sort(([, a], [, b]) => b - a)
					.slice(0, BALTOP_PLACES)
					.map(([id, bal]) => ({ userPromise: client.users.fetch(id), id, bal }))
					.map(async ({userPromise, id, bal}, i) => {
						const user = await userPromise;
						const name = (user) ? user.globalName : id;
						return `${i+1}. ${displayMoney(bal)}: \`${name}\``;
					})
				)).join('\n');

			await interaction.reply({
				embeds: [{
					title: "BalTop Leaderboard",
					description: leaderboard,
					color: BRANDING_GOLD,
				}],
			});
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
				await interaction.reply({
					content: 'I\'d rather not, to be honest.',
					flags: EPHEMERAL,
				});
				break;
			}

			await interaction.reply({ content: 'Process terminated.' });
			throw new Error(`Process terminated by \`${username}\` (${userId}).`);
		}
	}

	// Allow bot execution to continue.
	releaseLock();

	const timeSeconds = (performance.now() - startTime) / 1000;
	console.log(`Command completed after ${timeSeconds.toFixed(4)} seconds.`);
});

// Start the bot.
const startBot = async () => {
	const startTime = performance.now();

	await deploy();
	await client.login(TOKEN);

	// Begin automatic backups.
	setInterval(async () => {
		const releaseLock = await getLock();
		bank.backup();
		releaseLock();
	}, BACKUP_INTERVAL);

	const timeSeconds = (performance.now() - startTime) / 1000;
	console.log(`Bot started after ${timeSeconds.toFixed(4)} seconds.`);
};

startBot().then();
