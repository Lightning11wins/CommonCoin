
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');
const { TOKEN } = require('./secrets');
const { deploy, factions } = require('./deploy');

const startTime = performance.now();
const factionsNames = factions.map(faction => faction.value);
const factionsNameMap = factions.reduce((nameMap, {name, value}) => {
	nameMap[value] = name;
	return nameMap;
}, {});
factionsNameMap.unaffiliated = 'Unaffiliated';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Configs.
const ALLOWED_DECIMALS = 2;
const BACKUP_INTERVAL = 3600000;
const BACKUP_PATH = 'backups';
const LOG_PATH = 'logs';
const BALTOP_PLACES = 10;
const BRANDING_GOLD = 0xf9cc47;
const DB_FILEPATH = 'accounts.json';
const EPHEMERAL = 0b1000000;
const LOG_CHANNEL_ID = '1327831162558615602'; // 1330272746667511850 - Real Channel
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

const getName = (user) => user.globalName ?? user.username ?? user.tag ?? user.id ?? 'Unknown User';

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

// Function to get the current time.
const getDateTime = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` +
		`_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
};

// Log.
const logFilename = path.join(LOG_PATH, getDateTime() + '_log.txt');
const localLog = (msg) => {
	console.log('LOCAL LOG: ' + msg);
	const entry = `[${getDateTime()}] ${msg}\n`;
	const errorHandler = (err) => (err) && console.error('Local log error:', err);
	fs.appendFile(logFilename, entry, errorHandler);
};
const discordLog = async (msg) => {
	console.log('DISCORD LOG: ' + JSON.stringify(msg));
	try {
		await logChannel.send(msg);
	} catch (error) {
		console.error('Could not send message to the channel:', error);
	}
};

class Bank {
	constructor() {
		localLog('Constructing bank...');

		const data = fs.readFileSync(DB_FILEPATH, 'utf8');
		const accounts = this.accounts = JSON.parse(data);
		Object.keys(accounts).forEach(userId => {
			const account = accounts[userId], factionName = account[1];
			if (factionName && !factionsNames.includes(factionName)) {
				localLog(`WARNING: ${userId} is a member of unknown faction ${factionName}.`);
			}

			console.log(accounts[userId] = [toNumber(account[0]), factionName]);
		});

		this.commit();
		this.dirty = false;
		this.needsBackup = false;

		localLog('Bank created.');
	}

	get totalMoney() {
		return Object.values(bank.accounts).reduce((sum, value) => sum + value[0], 0);
	}

	getBal(userId, username) {
		const { accounts } = this, id = userId.toString().trim();
		if (accounts[id] === undefined) {
			this.dirty = true;
			localLog(`Added ${username} with balance of $0.00`);
			discordLog({
				embeds: [{
					title: 'New Account',
					description: `Added ${username} with balance of $0.00`,
					color: BRANDING_GOLD,
				}],
			}).then();
			return accounts[id] = [0];
		}
		return accounts[id][0];
	}
	setBal(userId, newBal) {
		const { accounts } = this, id = userId.toString().trim();
		if (accounts[id] === undefined) {
			throw new Error('Setting nonexistent user ID: ' + id);
		}

		localLog(`Set balance of ${userId} to ${newBal}.`);
		this.dirty = true;
		accounts[id][0] = newBal;
	}
	getFaction(userId) {
		const id = userId.toString().trim();
		return this.accounts[id][1] ?? 'Unaffiliated';
	}
	setFaction(userId, factionName) {
		const id = userId.toString().trim();
		this.dirty = true;
		this.accounts[id][1] = factionName;
	}
	commit() {
		if (this.dirty) {
			this.dirty = false;
			this.needsBackup = true;

			const data = JSON.stringify(this.accounts, null, 2);
			fs.writeFileSync(DB_FILEPATH, data, 'utf8');
			localLog('Transaction committed');
		}
	}
	backup() {
		if (this.needsBackup) {
			this.commit();
			this.needsBackup = false;

			const filename = getDateTime() + '.json';
			const filepath = path.join(BACKUP_PATH, filename);

			const data = JSON.stringify(this.accounts, null, 2);
			fs.writeFileSync(filepath, data, 'utf8');
			localLog('Backup created');

			return filepath;
		}
	}
}

// Bot setup.
client.once('ready', async () => {
	bank = new Bank();
	logChannel = await client.channels.fetch(LOG_CHANNEL_ID);

	const timeSeconds = (performance.now() - startTime) / 1000;
	localLog(`Bot started after ${timeSeconds.toFixed(4)} seconds.`);
});

// Bot command handling.
client.on('interactionCreate', async interaction => {
	const startTime = performance.now();
	if (!interaction.isCommand()) {
		return;
	}

	// Gather info.
	const user = interaction.user, userId = user.id, username = getName(user);
	const guild = interaction.guild, guildId = guild.id, guildName = guild.name;

	// Acquire the bot db lock, which is needed for reads and writes.
	const releaseLock = await getLock();

	// Execute the command.
	const { commandName } = interaction;
	switch (commandName) {
		case 'whoami': {
			await interaction.reply({
				content: `Your Discord UUID is: \`${userId}\``,
				flags: EPHEMERAL,
			});
			localLog(`${guildName} (${guildId}): ${username} (${userId}) used /${commandName}. SUCCESS`);
			break;
		}
		case 'bal': case 'balance': {
			const param1 = interaction.options.getUser('user'), target = param1 || user;
			const id = target.id, targetUsername = getName(target);

			const balance = bank.getBal(id, targetUsername);
			const factionName = factionsNameMap[bank.getFaction(userId)] ?? 'Unaffiliated';
			bank.commit();

			const name = (id === userId || !param1) ? 'Your' : `\`${targetUsername}\`'s`;
			await interaction.reply({
				embeds: [{
					title: 'Bank Account Status',
					description: [
						`${name} balance: ${displayMoney(balance)}`,
						`Faction: **${factionName}**`,
					].join('\n'),
					color: BRANDING_GOLD,
				}],
			});
			localLog(`${guildName} (${guildId}): ${username} (${userId}) used /${commandName} on ${targetUsername}. SUCCESS`);
			break;
		}
		case 'pay': case 'transfer': {
			// Recipient info.
			const recipient = interaction.options.getUser('user'), recipientId = recipient.id, recipientUsername = getName(recipient);
			const amount = toNumber(interaction.options.getNumber('amount'));
			const reason = interaction.options.getString('reason');

			// Calculations.
			const userBal = bank.getBal(userId, username), recipientBal = bank.getBal(recipientId, username);
			const newUserBal = userBal - amount, newRecipientBal = recipientBal + amount;

			// Error checking.
			if (amount <= 0) {
				await interaction.reply({
					embeds: [{
						title: 'Transfer Failed',
						description: `Nice try, but ${displayMoney(amount)} is a negative number.`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) failed to use /${commandName} because amount was ${amount}. FAIL`);
				break;
			}
			if (newUserBal < 0) {
				await interaction.reply({
					embeds: [{
						title: 'Transfer Failed',
						description: `${displayMoney(userBal)} - ${displayMoney(amount)} = ${displayMoney(newUserBal)}! (Going into debt is not allowed.)`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) failed to use /${commandName} because ${userBal} - ${amount} = ${newUserBal}. (Going into debt is not allowed.) FAIL`);
				break;
			}
			if (recipientId === botId) {
				await interaction.reply({
					embeds: [{
						title: 'Transfer Failed',
						description: 'You cannot send money to the economy bot.',
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) failed to use /${commandName} because you cannot transfer money to the economy bot. FAIL`);
				break;
			}
			if (recipientId === userId) {
				await interaction.reply({
					embeds: [{
						title: 'Transfer Failed',
						description: 'You cannot send money to yourself.',
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) failed to use /${commandName} because you cannot transfer money to yourself. FAIL`);
				break;
			}
			if (reason.length < MIN_REASON_LENGTH) {
				await interaction.reply({
					embeds: [{
						title: 'Transfer Failed',
						description: `Your reason should be **at least ${MIN_REASON_LENGTH}** characters long. FAIL`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) failed to use /${commandName} because the reason was shorter than the min length (${reason.length} < ${MIN_REASON_LENGTH}). FAIL\n> Reason: ${reason}`);
				return;
			}
			if (reason.length > MAX_REASON_LENGTH) {
				await interaction.reply({
					embeds: [{
						title: 'Transfer Failed',
						description: `Your reason should be **at most ${MAX_REASON_LENGTH}** characters long.`,
						color: BRANDING_GOLD,
					}],
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) failed to use /${commandName} because the reason was longer than the max length (${reason.length} > ${MAX_REASON_LENGTH}). FAIL\n> Reason: ${reason}`);
				return;
			}

			// Make the transaction.
			bank.setBal(userId, newUserBal);
			bank.setBal(recipientId, newRecipientBal);
			bank.commit();

			// Logging.
			const logPromise = discordLog({
				embeds: [{
					title: 'Disclosure: Common Coin Transferred',
					description: [
						'**Sender**: ' + username,
						'**Recipient**: ' + recipientUsername,
						'**Amount**: ' + displayMoney(amount),
						'**Reason**:',
						'> ' + reason,
						'',
						'Location: ' + guildName,
					].join('\n'),
					color: BRANDING_GOLD,
				}],
			});
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
			localLog(`${guildName} (${guildId}): ${username} (${userId}) transferred ${amount} to ${recipientUsername} (${recipientId}) with /${commandName}. SUCCESS\n> Reason: ${reason}`);
			await logPromise;
			break;
		}
		case 'mint': {
			// Calculations.
			const recipient = interaction.options.getUser('user'), recipientId = recipient.id, recipientUsername = getName(recipient);
			const amount = toNumber(interaction.options.getNumber('amount'));
			const userBal = bank.getBal(recipientId, username), newBal = userBal + amount;

			// Authentication.
			if (!isAdmin(userId)) {
				await interaction.reply({
					content: 'no lol :)',
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) attempted to mint ${amount} for ${recipientUsername} (${recipientId}). FAIL`);
				break;
			}

			// Make the transaction.
			bank.setBal(recipientId, newBal);
			bank.commit();

			// Logging.
			const logPromise = discordLog({
				embeds: [{
					title: 'Disclosure: Common Coin Minted',
					description: [
						'**Issuer**: ' + username,
						'**Recipient**: ' + recipientUsername,
						'**Amount**: ' + displayMoney(amount),
						'',
						'Location: ' + guildName,
						'',
						'The corresponding quantity of diamonds has been',
						'deposited into The United Exchange central vault.',
					].join('\n'),
					color: BRANDING_GOLD,
				}],
			});
			await interaction.reply({
				embeds: [{
					title: "Common Coin Minted",
					description: `Minted ${displayMoney(amount)} for ${recipientUsername}.`,
					color: BRANDING_GOLD,
				}],
			});
			localLog(`${guildName} (${guildId}): ${username} (${userId}) minted ${amount} for ${recipientUsername} (${recipientId}). SUCCESS`);
			await logPromise;
			break;
		}
		case 'setfaction': case 'joinfaction': {
			// Input parsing and validation.
			const factionName = interaction.options.getString('faction');
			if (!factionsNames.includes(factionName)) {
				await interaction.reply({
					content: `Unknown faction \`${factionName}\`. Please contact \`Lightning_11\` to have your faction added if it is missing from the list.`,
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) attempted to join unknown faction ${factionName} using /${commandName}. FAIL`);
				break;
			}

			// Set the user's faction.
			bank.setFaction(userId, factionName);
			bank.commit();

			// Respond.
			await interaction.reply({
				embeds: [{
					title: `Faction Set`,
					description: `New Faction: \`${factionsNameMap[factionName]}\`.`,
					color: BRANDING_GOLD,
				}],
				flags: EPHEMERAL,
			});
			localLog(`${guildName} (${guildId}): ${username} (${userId}) joined the ${factionName} faction using /${commandName}. SUCCESS`);
			break;
		}
		case 'baltop': case 'top': case 'leaderboard': {
			const { totalMoney } = bank;
			const leaderboard = (await Promise.all(
				Object.entries(bank.accounts)
					.sort(([, [a]], [, [b]]) => b - a)
					.slice(0, BALTOP_PLACES)
					.map(([id, [bal, ]]) => ({ userPromise: client.users.fetch(id), id, bal }))
					.map(async ({userPromise, id, bal}, i) => {
						const user = await userPromise;
						const name = (user) ? getName(user) : id;
						const percentage = ((bal / totalMoney) * 100).toFixed(2);
						return `${i+1}. ${displayMoney(bal)} (${percentage}%): \`${name}\``;
					})
				)).join('\n');

			await interaction.reply({
				embeds: [{
					title: "BalTop Leaderboard",
					description: leaderboard,
					color: BRANDING_GOLD,
				}],
			});
			localLog(`${guildName} (${guildId}): ${username} (${userId}) checked the leaderboard with /${commandName}. SUCCESS`);
			break;
		}
		case 'fbaltop': case 'ftop': case 'fleaderboard': {
			const { totalMoney } = bank;
			const factionValues = Object.values(bank.accounts)
				.reduce((factions, [money, factionName]) => {
					const factionKey = factionName ?? 'unaffiliated';
					factions[factionKey] = (factions[factionKey] || 0) + money;
					return factions;
				}, {});

			const leaderboard = Object.entries(factionValues)
				.sort(([, a], [, b]) => b - a)
				.slice(0, BALTOP_PLACES)
				.map(([factionMame, bal], i) => {
					const percentage = ((bal / totalMoney) * 100).toFixed(2);
					return `${i+1}. ${displayMoney(bal)} (${percentage}%): \`${factionsNameMap[factionMame]}\``;
				}).join('\n');

			await interaction.reply({
				embeds: [{
					title: "Faction Leaderboard",
					description: leaderboard,
					color: BRANDING_GOLD,
				}],
			});
			localLog(`${guildName} (${guildId}): ${username} (${userId}) checked the faction leaderboard with /${commandName}. SUCCESS`);
			break;
		}
		case 'eco': case 'economy': {
			const { totalMoney } = bank;

			await interaction.reply({
				embeds: [{
					title: "Economy Status",
					description: 'Total Money: ' + displayMoney(totalMoney),
					color: BRANDING_GOLD,
				}],
			});
			localLog(`${guildName} (${guildId}): ${username} (${userId}) checked the total money in the economy (${totalMoney}) with /${commandName}. SUCCESS`);
			break;
		}
		case 'backup': {
			if (!isAdmin(userId)) {
				await interaction.reply('Really?');
				break;
			}

			const backupName = bank.backup();
			await interaction.reply({ content: `Backup created: \`${backupName}\`` });
			localLog(`${guildName} (${guildId}): ${username} (${userId}) issued /${commandName} to create a backup. SUCCESS`);
			break;
		}
		case 'exit': {
			if (!isAdmin(userId)) {
				await interaction.reply({
					content: 'I\'d rather not, to be honest.',
					flags: EPHEMERAL,
				});
				localLog(`${guildName} (${guildId}): ${username} (${userId}) attempted to terminate the bot by issuing /${commandName}. FAIL`);
				break;
			}

			await interaction.reply({ content: 'Process terminated.' });
			localLog(`${guildName} (${guildId}): ${username} (${userId}) has terminated the bot by issuing /${commandName}. SUCCESS`);
			throw new Error(`Process terminated by \`${username}\` (${userId}).`);
		}
	}

	// Allow bot execution to continue.
	releaseLock();

	const timeSeconds = (performance.now() - startTime) / 1000;
	localLog(`Completed /${commandName} after ${timeSeconds.toFixed(4)} seconds.`);
});

// Start the bot.
const startBot = async () => {
	await deploy();
	await client.login(TOKEN);

	// Begin automatic backups.
	setInterval(async () => {
		const releaseLock = await getLock();
		bank.backup();
		releaseLock();
	}, BACKUP_INTERVAL);
};

startBot().then();
