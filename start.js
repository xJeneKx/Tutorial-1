/*jslint node: true */
'use strict';
const constants = require('byteballcore/constants.js');
const conf = require('byteballcore/conf');
const db = require('byteballcore/db');
const eventBus = require('byteballcore/event_bus');
const validationUtils = require('byteballcore/validation_utils');
const headlessWallet = require('headless-byteball');

let assocDeviceAddressToPeerAddress = {};
let assocDeviceAddressToMyAddress = {};
let assocMyAddressToDeviceAddress = {};

/**
 * headless wallet is ready
 */
eventBus.once('headless_wallet_ready', () => {
	headlessWallet.setupChatEventHandlers();
	
	eventBus.on('paired', (from_address, pairing_secret) => {
		const device = require('byteballcore/device.js');
		device.sendMessageToDevice(from_address, 'text', "Please send me your address");
	});
	
	eventBus.on('text', (from_address, text) => {
		const device = require('byteballcore/device.js');
		text = text.trim();
		if (validationUtils.isValidAddress(text)) {
			assocDeviceAddressToPeerAddress[from_address] = text;
			device.sendMessageToDevice(from_address, 'text', 'Saved your Byteball address');
			headlessWallet.issueNextMainAddress((address) => {
				assocMyAddressToDeviceAddress[address] = from_address;
				assocDeviceAddressToMyAddress[from_address] = address;
				device.sendMessageToDevice(from_address, 'text', '[balance](byteball:' + address + '?amount=5000)');
			});
		} else if (assocDeviceAddressToMyAddress[from_address]) {
			device.sendMessageToDevice(from_address, 'text', '[balance](byteball:' + assocDeviceAddressToMyAddress[from_address] + '?amount=5000)');
		} else {
			device.sendMessageToDevice(from_address, 'text', "Please send me your address");
		}
	});
	
});


/**
 * user pays to the bot
 */
eventBus.on('new_my_transactions', (arrUnits) => {
	const device = require('byteballcore/device.js');
	db.query("SELECT address, amount, asset FROM outputs WHERE unit IN (?)", [arrUnits], rows => {
		rows.forEach(row => {
			let deviceAddress = assocMyAddressToDeviceAddress[row.address];
			if (row.asset === null && deviceAddress) {
				device.sendMessageToDevice(deviceAddress, 'text', 'I received your payment: ' + row.amount + ' bytes');
				return true;
			}
		})
	});
});

/**
 * payment is confirmed
 */
eventBus.on('my_transactions_became_stable', (arrUnits) => {
	const device = require('byteballcore/device.js');
	db.query("SELECT address, amount, asset FROM outputs WHERE unit IN (?)", [arrUnits], rows => {
		rows.forEach(row => {
			let deviceAddress = assocMyAddressToDeviceAddress[row.address];
			if (row.asset === null && deviceAddress) {
				headlessWallet.sendAllBytesFromAddress(row.address, assocDeviceAddressToPeerAddress[deviceAddress], deviceAddress, (err, unit) => {
					if(err) device.sendMessageToDevice(deviceAddress, 'text', 'Oops, there\'s been a mistake. : ' + err);
					
					device.sendMessageToDevice(deviceAddress, 'text', 'I sent back your payment! Unit: ' + unit);
					return true;
				})
			}
		})
	});
});


process.on('unhandledRejection', up => { throw up; });
