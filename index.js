var instance_skel = require('../../instance_skel')
const upgradeScripts = require('./upgrades')
var WebSocket = require('ws')

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		this.choices_mode = [
			{ label: 'Show', id: 'show' },
			{ label: 'Blank', id: 'blank' },
			{ label: 'Theme', id: 'theme' },
			{ label: 'Desktop', id: 'desktop' },
		]

		this.choices_mode_with_toggle = [{ id: 'toggle', label: 'Toggle Blank/Show' }, ...this.choices_mode]

		this.choices_progress = [
			{ id: 'previous', label: 'Previous slide', button_label: 'Prev\\nslide', path: 'controller', action: 'previous' },
			{ id: 'next', label: 'Next slide', button_label: 'Next\\nslide', path: 'controller', action: 'next' },
			{
				id: 'prevSi',
				label: 'Previous service item',
				button_label: 'Prev\\nservice item',
				path: 'service',
				action: 'previous',
			},
			{
				id: 'nextSi',
				label: 'Next service item',
				button_label: 'Next\\nservice item',
				path: 'service',
				action: 'next',
			},
		]
	}

	// Return config fields for web config
	config_fields = () => {
		return [
			{
				type: 'dropdown',
				label: 'OpenLP version',
				id: 'version',
				default: 'v2',
				width: 5,
				choices: [
					{ id: 'v3', label: '3.0' },
					{ id: 'v2', label: '2.4' },
				],
			},
			{
				type: 'textinput',
				id: 'ip',
				label: 'Target IP',
				width: 8,
				required: true,
				default: '127.0.0.1',
				regex: this.REGEX_IP,
			},
			{
				type: 'number',
				id: 'port',
				label: 'Target Port',
				tooltip: 'The host of the OpenLP application',
				width: 3,
				default: 4316,
				regex: this.REGEX_PORT,
				isVisible: (configValues) => configValues.version === 'v2',
			},
			{
				type: 'text',
				id: 'info1',
				width: 12,
				label: '',
				value: '<br>',
			},
			{
				type: 'text',
				id: 'info2',
				width: 12,
				label: 'Optional Auth Settings',
				value: '',
			},
			{
				type: 'textinput',
				id: 'username',
				label: 'Username',
				tooltip: 'The username in case login is required',
				width: 5,
			},
			{
				type: 'textinput',
				id: 'password',
				label: 'Password',
				tooltip: 'The password in case login is required',
				width: 5,
			},
			{
				type: 'text',
				id: 'info3',
				width: 12,
				label: '',
				value: '<br>',
			},
			{
				type: 'text',
				id: 'info4',
				width: 12,
				label: 'Service list fetching',
				value: '',
			},
			{
				type: 'number',
				id: 'serviceItemLimit',
				label: 'Service items max count (0 to disable)',
				default: 7,
				tooltip: 'How many service items fetch',
				width: 6,
				min: 0,
				max: 20,
			},
			{
				type: 'textinput',
				id: 'serviceItemEmptyText',
				label: 'Empty string',
				default: '-',
				tooltip: 'What to display as empty value',
				width: 5,
			},
		]
	}

	init = () => {
		//this.status(this.STATUS_WARNING, 'Initializing')
		this.init_variables()
		this.init_actions()
		this.init_presets()
		this.init_feedbacks()

		this.service_increment = -1 // incremental version counter
		this.current_si = -1 // counted from 0
		this.current_slide = -1 // counted from 0
		this.current_si_uid = 'asdf' // current service item
		this.v3_service_list_data = [] // for switching SI in v3
		this.mode = -1

		if (this.config.ip) {
			if (this.config.version == 'v3') {
				this.config.port = 4316
				this.initV3()
			} else {
				this.initV2()
			}
		} else {
			this.status(this.STATUS_WARNING, 'No host configured')
		}

		this.auth_error = false
		this.polling = true
	}

	initV3 = () => {
		this.system.emit(
			'rest_get',
			'http://' + this.config.ip + ':' + this.config.port + '/api/v2/core/system',
			(err, result) => {
				if (err !== null) {
					this.status(this.STATUS_ERROR, result.error.code)
					this.log('error', 'HTTP GET Request failed (' + result.error.code + ')')
				} else {
					this.is_login_required = result.data.login_required
					this.initWebSocket(result.data.websocket_port)
					if (result.data.login_required) {
						if (!this.config.username || !this.config.password) {
							this.log(
								'error',
								'Please update user/password in module config, remote management requires authentication'
							)
						} else {
							this.loginV3()
						}
					}
				}
			}
		)
	}

	initWebSocket = (websocket_port) => {
		this.status(this.STATUS_UNKNOWN)
		if (!websocket_port) {
			this.status(this.STATUS_ERROR, 'Configuration error - no WebSocket port defined')
			return
		}

		if (this.ws !== undefined) {
			this.ws.close(1000)
			delete this.ws
		}
		this.ws = new WebSocket(`ws://${this.config.ip}:${websocket_port}`)

		this.ws.on('open', () => {
			this.log('debug', 'Connection opened via WS')
			this.status(this.STATUS_OK)
		})
		this.ws.on('close', (code) => {
			this.log('debug', `Connection closed with code ${code}`)
			this.status(this.STATUS_ERROR, `Connection closed with code ${code}`)
		})

		this.ws.on('message', this.interpretPollData)

		this.ws.on('error', (data) => {
			this.log('error', `WebSocket error: ${data}`)
		})
	}

	loginV3 = () => {
		this.system.emit(
			'rest',
			`http://${this.config.ip}:${this.config.port}/api/v2/core/login`,
			{ username: this.config.username, password: this.config.password },
			(err, result) => {
				if (err !== null) {
					this.log('error', `Login failed (${result.error.code})`)
					this.status(this.STATUS_ERROR, result.error.code)
				} else if (result.response.statusCode != 200) {
					this.log('error', `Login failed (${result.response.statusCode})`)
					this.status(this.STATUS_ERROR, result.response.statusMessage)
				} else {
					this.status(this.STATUS_OK)
					this.token = result.data.token
				}
			},
			{}
		)
	}

	destroy = () => {
		clearInterval(this.pollingInterval)

		if (this.ws !== undefined) {
			this.ws.close(1000)
			delete this.ws
		}

		this.status(this.STATUS_UNKNOWN, 'Disabled')
		this.debug('destroy')
	}

	throw401Warning = () => {
		this.log('error', 'Remote management requires authentication')
		this.status(this.STATUS_WARNING, 'Limited connection, only variables will work. Login is required.')
	}

	initV2 = () => {
		this.pollingInterval = setInterval(() => {
			this.poll()
		}, 500)
	}

	init_variables = () => {
		const vars = [
			{
				label: 'Current display mode',
				name: 'display_mode',
			},
			{
				name: 'slide',
				label: 'Current slide number',
			},
			{
				name: 'service_item',
				label: 'Current service item',
			},
		]

		for (let i = 1; i <= this.config.serviceItemLimit; i++) {
			vars.push({ name: `si_${i}`, label: `${i}. service item` })
			//vars.push({ name: `si_${i}_short`, label: `${i}. service item short` })
			//vars.push({ name: `si_${i}_type`, label: `${i}. service item type` })
			//vars.push({ name: `si_${i}_selected`, label: `${i}. service item selected state` })
		}

		this.setVariableDefinitions(vars)
	}

	init_presets = () => {
		let presets = this.choices_progress.map((a) => {
			return {
				category: 'Service items & Slides',
				label: a.label,
				bank: {
					style: 'text',
					text: a.button_label,
					size: 18,
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: a.id,
					},
				],
			}
		})

		presets.push({
			category: 'Service items & Slides',
			label: '1 $(openlp:si_1)',
			bank: {
				style: 'text',
				size: '14',
				text: '1 $(openlp:si_1)',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'gotoSi',
					options: { si: 1 },
				},
			],
			feedbacks: [
				{
					type: 'fbk_si',
					options: {
						si: 1,
					},
					style: {
						bgcolor: this.rgb(255, 0, 0),
						color: this.rgb(255, 255, 255),
					},
				},
			],
		})

		presets.push({
			category: 'Service items & Slides',
			label: 'Slide 1',
			bank: {
				style: 'text',
				text: 'Slide 1',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'gotoSlide',
					options: { slide: 1 },
				},
			],
			feedbacks: [
				{
					type: 'fbk_slide',
					options: {
						slide: 1,
					},
					style: {
						bgcolor: this.rgb(255, 0, 0),
						color: this.rgb(255, 255, 255),
					},
				},
			],
		})

		this.choices_mode.forEach((mode) => {
			presets.push({
				category: 'Display mode',
				label: mode.label,
				bank: {
					style: 'text',
					size: 18,
					text: mode.label,
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 51, 0),
				},
				actions: [
					{
						action: 'mode',
						options: {
							mode: mode.id,
						},
					},
				],
				feedbacks: [
					{
						type: 'mode',
						options: {
							mode: mode.id,
						},
						style: {
							color: this.rgb(255, 255, 255),
							bgcolor: this.rgb(255, 0, 0),
						},
					},
				],
			})
		})

		presets.push({
			category: 'Display mode',
			label: 'Toggle show/blank',
			bank: {
				style: 'text',
				text: 'Toggle $(openlp:display_mode)',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'mode',
					options: { mode: 'toggle' },
				},
			],
			feedbacks: [
				{
					type: 'mode',
					options: {
						mode: 'show',
					},
					style: {
						color: this.rgb(255, 0, 0),
					},
				},
				{
					type: 'mode',
					options: {
						mode: 'blank',
					},
					style: {
						color: this.rgb(125, 125, 125),
					},
				},
			],
		})

		this.setPresetDefinitions(presets)
	}

	static GetUpgradeScripts() {
		return [
			instance_skel.CreateConvertToBooleanFeedbackUpgradeScript({
				mode: true,
			}),
			upgradeScripts.updates013,
		]
	}

	init_feedbacks = () => {
		const feedbacks = {
			mode: {
				type: 'boolean',
				label: 'Display mode',
				description: 'If the display in defined state',
				style: {
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 255),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Mode',
						id: 'mode',
						choices: this.choices_mode,
						default: 'show',
					},
				],
				callback: (feedback) => {
					return this.display_mode == feedback.options.mode
				},
			},
			fbk_slide: {
				type: 'boolean',
				label: 'Service item on specified slide',
				description: 'If specific slide is active, change style of the bank',
				style: {
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(255, 0, 0),
				},
				options: [
					{
						type: 'number',
						label: 'Slide',
						id: 'slide',
						default: 1,
						min: 1,
					},
				],
				callback: (feedback) => {
					return this.current_slide + 1 == feedback.options.slide
				},
			},
			fbk_si: {
				type: 'boolean',
				label: 'Service item active',
				description: 'If specific service item is active, change style of the bank',
				style: {
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(255, 0, 0),
				},
				options: [
					{
						type: 'number',
						label: 'Service item',
						id: 'si',
						default: 1,
						min: 1,
					},
				],
				callback: (feedback) => {
					return this.current_si + 1 == feedback.options.si
				},
			},
		}

		this.setFeedbackDefinitions(feedbacks)
	}

	init_actions = () => {
		const actions = {
			next: { label: 'Next Slide' },
			previous: { label: 'Previous Slide' },
			nextSi: { label: 'Next Service item' },
			prevSi: { label: 'Prev Service item' },
			mode: {
				label: 'Display mode',
				options: [
					{
						type: 'dropdown',
						label: 'Mode',
						id: 'mode',
						default: '0',
						choices: this.choices_mode_with_toggle,
						minChoicesForSearch: 0,
					},
				],
			},
			gotoSi: {
				label: 'Specific Service item',
				options: [
					{
						type: 'number',
						label: 'Service item',
						id: 'si',
						min: 1,
						default: 1,
					},
				],
			},
			gotoSlide: {
				label: 'Specific Slide (in current Service item)',
				options: [
					{
						type: 'number',
						label: 'Slide',
						id: 'slide',
						min: 1,
						default: 1,
					},
				],
			},
		}

		if (this.config.version == 'v2') {
			actions.refreshSiList = {
				label: 'Refresh Service items list',
			}
		}

		/*
		progress: {
			label: 'Progress',
			options: [
				{
					type: 'dropdown',
					label: 'Direction',
					id: 'direction',
					default: 0,
					choices: this.choices_progress,
					minChoicesForSearch: 0,
				},
			],
		},
		*/

		this.setActions(actions)
	}

	action = (action) => {
		if (this.config.version == 'v3') {
			this.actionV3(action)
		} else {
			this.actionV2(action)
		}
	}

	actionV2 = (action) => {
		let urlAction = ''
		switch (action.action) {
			case 'gotoSi':
				urlAction = 'service/set?data=' + JSON.stringify({ request: { id: Number(action.options.si - 1) } })
				break
			case 'refreshSiList':
				this.fetchServiceListV2()
				return
			case 'mode':
				let path = action.options.mode
				if (action.options.mode == 'toggle') {
					path = this.display_mode == 'blank' ? 'show' : 'blank'
				}
				urlAction = 'display/' + path
				break
			case 'nextSi':
				urlAction = 'service/next'
				break
			case 'prevSi':
				urlAction = 'service/previous'
				break
			case 'next':
				urlAction = 'controller/live/next'
				break
			case 'previous':
				urlAction = 'controller/live/previous'
				break
			case 'gotoSlide':
				urlAction = 'controller/live/set?data=' + JSON.stringify({ request: { id: Number(action.options.slide - 1) } })
				break
		}
		const url = 'http://' + this.config.ip + ':' + this.config.port + '/api/' + urlAction
		//console.log(url)
		this.system.emit('rest_get', url, this.interpretActionResult, this.headersV2())
		this.polling = true // Turn on polling when a command has been sent - will be turned off again elsewhere e.g. if OpenLP is not running
	}

	headersV3 = () => {
		const headers = {}
		if (this.is_login_required && this.token) {
			headers['Authorization'] = 'Basic ' + this.token
		}
		return headers
	}

	actionV3 = (action) => {
		if (this.is_login_required && !this.token) {
			this.throw401Warning()
			return
		}

		let urlAction = ''
		let param = {}

		switch (action.action) {
			case 'mode':
				urlAction = 'core/display'
				param = {
					display: action.options.mode,
				}
				if (action.options.mode == 'toggle') {
					param.display = this.display_mode == 'blank' ? 'show' : 'blank'
				}
				break
			case 'nextSi':
				urlAction = 'service/progress'
				param = {
					action: 'next',
				}
				break
			case 'prevSi':
				urlAction = 'service/progress'
				param = {
					action: 'previous',
				}
				break
			case 'next':
				urlAction = 'controller/progress'
				param = {
					action: 'next',
				}
				break
			case 'previous':
				urlAction = 'controller/progress'
				param = {
					action: 'previous',
				}
				break
			case 'gotoSlide':
				urlAction = 'controller/show'
				param = { id: action.options.slide - 1 }
				break
			case 'gotoSi':
				urlAction = 'service/show'
				param = { id: this.v3_service_list_data[action.options.si - 1].id }
				break
		}

		const url = (this.is_secure ? 'https' : 'http') + `://${this.config.ip}:${this.config.port}/api/v2/${urlAction}`
		//console.log(url, param)
		this.system.emit('rest', url, param, this.interpretActionResult, this.headersV3())
	}

	interpretActionResult = (err, result) => {
		if (err !== null) {
			this.log('error', 'HTTP Request failed (' + result.error.code + ')')
			this.status(this.STATUS_ERROR, result.error.code)
			this.polling = false // Turn off polling to avoid filling up Companion log e.g. if OpenLP is not running
		} else {
			if (result.response.statusCode == 401) {
				this.auth_error = true
				this.status(this.STATUS_ERROR, 'Authorization failed. Please check username and password.')
			} else if (result.response.statusCode != 200 && result.response.statusCode != 204) {
				this.status(this.STATUS_ERROR, 'Got status code ' + result.response.statusCode + ' from OpenLP.')
			} else {
				this.auth_error = false
				this.status(this.STATUS_OK)
			}
		}
	}

	updateConfig = (config) => {
		this.config = config
		clearInterval(this.pollingInterval)
		this.init()
	}

	poll = () => {
		// no config set yet - so no polling
		if (!this.config.ip && !this.config.port) {
			return
		}

		// No polling if earlier communication with OpenLP failed, e.g. if OpenLP is not running
		if (!this.polling) {
			return
		}

		this.system.emit(
			'rest_get',
			'http://' + this.config.ip + ':' + this.config.port + '/api/poll',
			(err, result) => {
				if (err !== null) {
					this.log('error', 'HTTP GET Request failed (' + result.error.code + ')')
					this.status(this.STATUS_ERROR, result.error.code)
					this.polling = false // Turn off polling to avoid filling up Companion log e.g. if OpenLP is not running
				} else {
					/* polling does not need auth and no auth error is triggered. But we do not want to override the error */
					if (!this.auth_error) {
						this.status(this.STATUS_OK)
					}
					this.interpretPollData(result.data.results)
				}
			},
			this.headersV2()
		)
	}

	headersV2 = () => {
		const headers = {}
		if (this.config.username && this.config.password) {
			headers['Authorization'] =
				'Basic ' + Buffer.from(this.config.username + ':' + this.config.password).toString('base64')
		}
		return headers
	}

	interpretPollData = (data) => {
		if (this.config.version == 'v3') {
			let msgValue = null
			try {
				msgValue = JSON.parse(data)
			} catch (e) {
				msgValue = data
			}
			data = msgValue.results
		}
		this.is_secure = data.isSecure
		//console.log(data)
		let chkFbkSlide = false
		if (data.slide != this.current_slide) {
			chkFbkSlide = true
		}

		if (data.service > this.service_increment || data.item != this.current_si_uid) {
			chkFbkSlide = true
			this.fetchCurrentServiceList()
		}

		// for proper feedback
		this.current_slide = data.slide
		this.service_increment = data.service
		this.current_si_uid = data.item
		this.setVariable('slide', data.slide + 1)

		if (chkFbkSlide) {
			this.checkFeedbacks('fbk_slide')
		}

		let mode = 'Show'
		if (data.blank) {
			mode = 'Blank'
		} else if (data.display) {
			mode = 'Desktop'
		} else if (data.theme) {
			mode = 'Theme'
		}
		this.display_mode = mode.toLowerCase()
		this.setVariable('display_mode', mode)
		this.checkFeedbacks('mode')
	}

	fetchCurrentServiceList = () => {
		if (this.config.version == 'v3') {
			this.fetchServiceListV3()
		} else {
			this.fetchServiceListV2()
		}
	}

	fetchServiceListV2 = () => {
		this.system.emit(
			'rest_get',
			'http://' + this.config.ip + ':' + this.config.port + '/api/service/list',
			(err, result) => {
				if (err !== null) {
					this.log('error', 'HTTP GET Request failed (' + result.error.code + ')')
					this.status(this.STATUS_ERROR, result.error.code)
					this.polling = false // Turn off polling to avoid filling up Companion log e.g. if OpenLP is not running
				} else {
					this.interpretServiceListData(result.data.results.items)
				}
			},
			this.headersV2()
		)
	}
	fetchServiceListV3 = () => {
		this.system.emit(
			'rest_get',
			'http://' + this.config.ip + ':' + this.config.port + '/api/v2/service/items',
			(err, result) => {
				if (err !== null) {
					this.log('error', 'HTTP GET Request failed (' + result.error.code + ')')
					this.status(this.STATUS_ERROR, result.error.code)
					this.polling = false // Turn off polling to avoid filling up Companion log e.g. if OpenLP is not running
				} else {
					this.v3_service_list_data = result.data
					this.interpretServiceListData(result.data)
				}
			},
			this.headersV3()
		)
	}

	interpretServiceListData = (items) => {
		items.forEach((si, i) => {
			this.setVariable(`si_${i + 1}`, si.title)
			//this.setVariable(`si_${i + 1}_short`, si.title.substr(0, 15))
			//this.setVariable(`si_${i + 1}_type`, si.plugin)
			if (si.selected) {
				this.current_si = i
				this.setVariable('service_item', si.title)
				//this.setVariable(`current_si_short`, si.title.substr(0, 15))
			}
		})
		for (let i = items.length + 1; i <= this.config.serviceItemLimit; i++) {
			this.setVariable(`si_${i}`, this.config.serviceItemEmptyText)
			//this.setVariable(`si_${i}_short`, this.config.serviceItemEmptyText)
			//this.setVariable(`si_${i}_type`, this.config.serviceItemEmptyText)
		}
		this.checkFeedbacks('fbk_si')
	}
}

exports = module.exports = instance
