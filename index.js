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
				id: 'info',
				width: 12,
				label: '',
				value: '<br>',
			},
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Optional Settings',
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
		]
	}

	init = () => {
		//this.status(this.STATUS_WARNING, 'Initializing')
		this.init_variables()
		this.init_actions()
		this.init_presets()
		this.init_feedbacks()

		if (this.config.ip) {
			if (this.config.version == 'v3') {
				this.config.port = 4316
				this.init_v3_ws()
			} else {
				this.init_v2_poll()
			}
		} else {
			this.status(this.STATUS_WARNING, 'No host configured')
		}

		this.auth_error = false
		this.mode = -1
		this.polling = true
	}

	init_v3_ws = () => {
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

		this.ws.on('message', this.interpretData)

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

	init_v2_poll = () => {
		this.pollingInterval = setInterval(() => {
			this.poll()
		}, 500)
	}

	init_variables = () => {
		this.setVariableDefinitions([
			{
				label: 'Current display mode',
				name: 'display_mode',
			},
			{
				name: 'slide',
				label: 'Current slide number',
			},
		])
		//this.setVariable('display_mode', 'Unknown')
	}

	init_presets = () => {
		let presets = this.choices_progress.map((a) => {
			return {
				category: 'Services/Slides',
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

		if (this.config.version == 'v3') {
			presets.push({
				category: 'Services/Slides',
				label: 'Go to slide #1',
				bank: {
					style: 'text',
					text: 'Go to slide #1',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: 'go_to_slide',
						options: { slide: 0 },
					},
				],
				feedbacks: [
					{
						type: 'slide',
						options: {
							slide: 0,
						},
						style: {
							bgcolor: this.rgb(255, 0, 0),
							color: this.rgb(255, 255, 255),
						},
					},
				],
			})
		}

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
			upgradeScripts.setDefaultVersion2,
		]
	}

	init_feedbacks = () => {
		const feedbacks = {
			mode: {
				type: 'boolean',
				label: 'Display mode state change',
				description:
					'Changes the foreground and background color of the bank if the display mode changes to the defined state',
				style: {
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 255),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Display mode',
						id: 'mode',
						choices: this.choices_mode,
						default: 'show',
					},
				],
				callback: (feedback) => {
					return this.display_mode == feedback.options.mode
				},
			},
			slide: {
				type: 'boolean',
				label: 'Presentation on specified slide',
				description: 'Changes the foreground and background color of the bank if the slide is on defined place',
				style: {
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(255, 0, 0),
				},
				options: [
					{
						type: 'number',
						label: 'Slide',
						id: 'slide',
						default: 0,
					},
				],
				callback: (feedback) => {
					return this.current_slide == feedback.options.slide
				},
			},
		}

		this.setFeedbackDefinitions(feedbacks)
	}

	init_actions = () => {
		const actions = {
			next: { label: 'Next Slide' },
			previous: { label: 'Previous Slide' },
			nextSi: { label: 'Next Service Item' },
			prevSi: { label: 'Prev Service Item' },
			mode: {
				label: 'Set display mode',
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
		}
		if (this.config.version == 'v3') {
			actions.go_to_slide = {
				label: 'Go to slide number (counted from 0)',
				options: [
					{
						type: 'number',
						label: 'Slide',
						id: 'slide',
						min: 0,
						default: 0,
						required: true,
						range: false,
					},
				],
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
		const headers = {}
		if (this.config.username && this.config.password) {
			headers['Authorization'] =
				'Basic ' + Buffer.from(this.config.username + ':' + this.config.password).toString('base64')
		}

		let urlAction = ''
		switch (action.action) {
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
			case 'go_to_slide':
				this.status(this.STATUS_WARNING, 'go_to_slide not supported in Openlp 2.4')
				break
		}
		const url = 'http://' + this.config.ip + ':' + this.config.port + '/api/' + urlAction
		//console.log(url)
		this.system.emit('rest_get', url, this.interpretActionResult, headers)
		this.polling = true // Turn on polling when a command has been sent - will be turned off again elsewhere e.g. if OpenLP is not running
	}

	actionV3 = (action) => {
		const headers = {}
		if (this.is_login_required) {
			if (this.token) {
				headers['Authorization'] = 'Basic ' + this.token
			} else {
				this.throw401Warning()
				return
			}
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
			case 'go_to_slide':
				urlAction = 'controller/show'
				param = { id: action.options.slide }
				break
		}

		const url = (this.is_secure ? 'https' : 'http') + `://${this.config.ip}:${this.config.port}/api/v2/${urlAction}`
		//console.log(url, param)
		this.system.emit('rest', url, param, this.interpretActionResult, headers)
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

		var headers = {}
		if (this.config.username && this.config.password) {
			headers['Authorization'] =
				'Basic ' + Buffer.from(this.config.username + ':' + this.config.password).toString('base64')
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
					this.interpretData(result.data.results)
				}
			},
			headers
		)
	}

	interpretData = (data) => {
		if (this.config.version == 'v3') {
			let msgValue = null
			try {
				msgValue = JSON.parse(data)
			} catch (e) {
				msgValue = data
			}
			data = msgValue.results
		}
		//console.log(data)
		this.is_secure = data.isSecure

		// for proper feedback
		this.current_slide = data.slide

		let mode = 'Show'
		if (data.blank) {
			mode = 'Blank'
		} else if (data.display) {
			mode = 'Desktop'
		} else if (data.theme) {
			mode = 'Theme'
		}

		// for correct toggling action/feedbacks
		this.display_mode = mode.toLowerCase()

		this.setVariable('slide', data.slide)
		this.setVariable('display_mode', mode)
		this.checkFeedbacks('slide')
		this.checkFeedbacks('mode')
	}
}

exports = module.exports = instance
