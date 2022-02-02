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
}
