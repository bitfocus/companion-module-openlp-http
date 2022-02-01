module.exports = {
	setDefaultVersion2: function (context, config) {
		if (!config.version) {
			config.version = 'v2'
			return true
		}
		return false
	},
}
