module.exports = {
	updates013: function (context, config) {
		let changed = false
		if (!config.version) {
			config.version = 'v2'
			changed = true
		}
		if (!config.serviceItemEmptyText) {
			config.serviceItemEmptyText = '-'
			changed = true
		}
		if (!config.serviceItemLimit) {
			config.serviceItemLimit = 7
			changed = true
		}
		return changed
	},
	updates016: function (context, config, actions) {
		let changed = false
		if (!config.slideItemLimit) {
			config.slideItemLimit = 12
			changed = true
		}
		for (let k in actions) {
			let action = actions[k]
			if (action.action == 'mode') {
				if (action.options.mode == '0') {
					action.options.mode == 'show'
					changed = true
				} else if (action.options.mode == '1') {
					action.options.mode == 'blank'
					changed = true
				} else if (action.options.mode == '2') {
					action.options.mode == 'theme'
					changed = true
				} else if (action.options.mode == '3') {
					action.options.mode == 'desktop'
					changed = true
				} else if (action.options.mode == '4') {
					action.options.mode == 'toggle'
					changed = true
				}
			}
		}
		return changed
	},
}
