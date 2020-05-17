var tcp           = require('../../tcp');
var instance_skel = require('../../instance_skel');

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}


// Return config fields for web config
instance.prototype.config_fields = function() {
	var self = this;

	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 5,
			regex: self.REGEX_IP
		},
		{
			type: 'number',
			id: 'port',
			label: 'Target Port (Default: 4316)',
			width: 3,
			default: 4316,
			regex: self.REGEX_PORT
        },
        {
            type: 'textinput',
            id: 'username',
            label: 'Username',
            width: 10
        },
        {
            type: 'textinput',
            id: 'password',
            label: 'Password',
            width: 10
        }
	];
}

instance.prototype.init = function() {
	var self = this;

	self.init_variables();
	self.init_presets();
	self.init_feedbacks();
}

instance.prototype.destroy = function() {
	var self = this;
}

instance.prototype.choices_mode = [
    {id: 0, label: 'Show'},
    {id: 1, label: 'Hide'},
    {id: 2, label: 'Background'},
    {id: 3, label: 'Desktop'}
];

instance.prototype.init_variables = function () {
	var self = this;
	var variables = [
		{
			label: 'Display Mode',
			name: 'display_mode'
		}
	];

	self.setVariableDefinitions(variables);
}

instance.prototype.init_presets = function () {
	var self = this;
	var presets = [];
    var size = '18';
    
    presets.push({
        category: 'Slides',
        label: 'Next',
        bank: {
            style: 'png',
            png64: self.ICON_DOWN,
            pngalignment: 'center:center',
            size: size,
            color: self.rgb(255, 255, 255),
            bgolor: self.rgb(0,0,0)
        },
        actions: [{
            action: 'next'
        }]
    });

    presets.push({
        category: 'Slides',
        label: 'Previous',
        bank: {
            style: 'png',
            png64: self.ICON_UP,
            pngalignment: 'center:center',
            size: size,
            color: self.rgb(255, 255, 255),
            bgcolor: self.rgb(0,0,0)
        },
        actions: [{
            action: 'previous'
        }]
    })

	for (var mode in self.choices_mode) {
		presets.push({
			category: 'Modes',
			label: self.choices_mode[mode].label,
			bank: {
				style: 'text',
				size: size,
				text: self.choices_mode[mode].label,
				color: self.rgb(255, 255, 255),
				bgcolor: self.rgb(0,0,0)
			},
			actions: [{
				action: 'mode',
				options: {
					action: self.choices_mode[mode].id
				}
			}],
			feedbacks: [{
				type: 'mode',
				options: {
					mode: self.choices_mode[mode].id,
					background_active: self.rgb(0, 0, 255),
					background_inactive: self.rgb(0,0,0),
					foreground_active: self.rgb(255,255,255),
					foreground_inactive: self.rgb(255, 255, 255)
				}
			}]
		});
	}

	self.setPresetDefinitions(presets);
}

instance.prototype.init_feedbacks = function () {
	var self = this;
	var feedbacks = {};

	var backgroundForegroundActiveOptions = [{
		type: 'colorpicker',
		label: 'foreground and background color active',
		id: 'bg_active',
		default: this.rgb(0, 0, 255)
	},
	{
		type: 'colorpicker',
		label: 'Foreground color active',
		id: 'fg_active',
		default: this.rgb(255, 255, 255)
	},
	{
		type: 'colorpicker',
		label: 'foreground and background color inactive',
		id: 'bg_inactive',
		default: this.rgb(0, 0, 0)
	},
	{
		type: 'colorpicker',
		label: 'Foreground color inactive',
		id: 'fg_inactive',
		default: this.rgb(255, 255, 255)
	}];

	feedbacks['mode'] = {
		label: 'Display mode state change',
		description: 'Changes the foreground and background color of the bank to the active colors if the display mode changes to the defined state, otherwise the inactive colors are used',
		options: [
			{
				type: 'dropdown',
				label: 'Display mode',
				id: 'mode',
				choices: self.choices_mode,
				default: 0
			}
		]
	};

	for (var key in feedbacks) {
		feedbacks[key].options = backgroundForegroundActiveOptions.concat(feedbacks[key].options);
	}

	self.setFeedbackDefinitions(feedbacks);
}

instance.prototype.actions = function() {
	var self = this;

	self.system.emit('instance_actions', self.id, {
		'next': {label: 'Next Slide'},
		'previous': {label: 'Previous Slide'},
		'mode': {
			label: 'Display Mode',
			options: [
				{
					type: 'dropdown',
					id: 'action',
                    label: 'mode',
                    default: 0,
                    choices: self.choices_mode
				}
			]
		}
	});
}

instance.prototype.action = function(action) {
	var self = this;
}

instance.prototype.feedback = function(feedback) {
	var self = this;
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;