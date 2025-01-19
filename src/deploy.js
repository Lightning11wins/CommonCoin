
const { REST, Routes } = require('discord.js');
const { TOKEN, CLIENT_ID } = require('./secrets');

// Bot install link.
// https://discord.com/oauth2/authorize?client_id=1329578684960739359&permissions=67584&integration_type=0&scope=bot

const Type = {
	string: 3,
	user: 6,
	int: 4,
	float: 10,
};

const factions = [
	{ name: 'Astral Vanguard', value: 'astral'},
	{ name: 'Auditor', value: 'auditor'},
	{ name: 'Blue Bird', value: 'blue_bird'},
	{ name: 'Faelorn Darthulia', value: 'faelorn'},
	{ name: 'Grand Kingdom of Khazabrar', value: 'dwarves'},
	{ name: 'Kairengoku Empire', value: 'goku'},
	{ name: 'Land of Awesomeness', value: 'awesome'},
	{ name: 'Lunaria', value: 'lunaria'},
	{ name: 'Mjirr\'s Edge', value: 'mjirr_edge'},
	{ name: 'Northwind', value: 'northwind'},
	{ name: 'Phoenix Republic', value: 'phoenix'},
	{ name: 'Reggionic Cult', value: 'cult'},
	{ name: 'Shiverbane', value: 'shiverbane'},
	{ name: 'The Epic Alliance', value: 'epic'},
	{ name: 'The Hand of Kravor', value: 'hand'},
	{ name: 'The Knights of Camelot', value: 'knights'},
	{ name: 'The Order of the Sun and Moon', value: 'order'},
	{ name: 'Umbra', value: 'umbra'},
	{ name: 'Gods', value: 'gods'},
];

const commands = [
	{
		name: 'whoami',
		description: 'Get your user id.',
	},
	{
		name: 'invite',
		description: 'Get the link to invite the bot to your own server',
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
				type: Type.string,
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
				type: Type.string,
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
		name: 'setfaction',
		description: 'Specify your faction so that your money is counted for their net worth on the faction leaderboard.',
		options: [
			{
				type: Type.string,
				name: 'faction',
				description: 'Select a faction (DM Lightning_11 if your faction is missing)',
				required: true,
				choices: factions,
			},
		],
	},
	{
		name: 'joinfaction',
		description: 'Specify your faction so that your money is counted for their net worth on the faction leaderboard.',
		options: [
			{
				type: Type.string,
				name: 'faction',
				description: 'Select a faction (DM Lightning_11 if your faction is missing)',
				required: true,
				choices: factions,
			},
		],
	},
	{
		name: 'baltop',
		description: 'Show the richest players on the server.',
	},
	{
		name: 'top',
		description: 'Show the richest players on the server.',
	},
	{
		name: 'leaderboard',
		description: 'Show the richest players on the server.',
	},
	{
		name: 'fbaltop',
		description: 'Show the richest factions on the server.',
	},
	{
		name: 'ftop',
		description: 'Show the richest factions on the server.',
	},
	{
		name: 'fleaderboard',
		description: 'Show the richest factions on the server.',
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
	deploy,
	factions,
};
