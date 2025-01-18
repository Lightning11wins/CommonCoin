
const { REST, Routes } = require('discord.js');
const { TOKEN, CLIENT_ID } = require('./secrets');

// Bot install link.
// https://discord.com/oauth2/authorize?client_id=1329578684960739359&permissions=67584&integration_type=0&scope=bot

const Type = {
	user: 6,
	int: 4,
	float: 10,
};

const commands = [
	{
		name: 'whoami',
		description: 'Get your user id.',
	},
	{
		name: 'bal',
		description: 'Display your current balance.',
		options: [
			{
				type: Type.user,
				name: 'user',
				description: 'The player you\'re checking.',
				required: false,
			}
		]
	},
	{
		name: 'balance',
		description: 'Display your current balance.',
		options: [
			{
				type: Type.user,
				name: 'user',
				description: 'The player you\'re checking.',
				required: false,
			}
		]
	},
	{
		name: 'pay',
		description: 'Pay money to another player.',
		options: [
			{
				type: Type.user,
				name: 'user',
				description: 'The player receiving the money.',
				required: true,
			},
			{
				type: Type.float,
				name: 'amount',
				description: 'The amount of money being sent.',
				required: true,
			},
			{
				type: 3,
				name: 'reason',
				description: 'The reason for sending the money',
				required: true,
			}
		],
	},
	{
		name: 'transfer',
		description: 'Pay money to another player.',
		options: [
			{
				type: Type.user,
				name: 'user',
				description: 'The player receiving the money.',
				required: true,
			},
			{
				type: Type.float,
				name: 'amount',
				description: 'The amount of money being sent.',
				required: true,
			},
			{
				type: 3,
				name: 'reason',
				description: 'The reason for sending the money',
				required: true,
			}
		],
	},
	{
		name: 'mint',
		description: 'Mint new currency.',
		options: [
			{
				type: Type.float,
				name: 'amount',
				description: 'The amount of money being minted.',
				required: true,
			},
			{
				type: Type.user,
				name: 'user',
				description: 'The player to whom minted money is given.',
				required: true,
			},
		]
	},
	{
		name: 'baltop',
		description: 'Show the richest users on the server.',
	},
	{
		name: 'top',
		description: 'Show the richest users on the server.',
	},
	{
		name: 'leaderboard',
		description: 'Show the richest users on the server.',
	},
	{
		name: 'eco',
		description: 'Show the total money in circulation in the economy.',
	},
	{
		name: 'economy',
		description: 'Show the total money in circulation in the economy.',
	},
	{
		name: 'backup',
		description: 'Create a backup of the bank.',
	},
	{
		name: 'exit',
		description: 'Instantly shut down the bot.',
	},
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

const deploy = async () => {
	try {
		console.log('Started refreshing application (/) commands.');

		await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
};

if (require.main === module) {
	deploy().then();
}

module.exports = {
	deploy
};
