var instance_skel = require('../../instance_skel');

function instance(system, id, config) {
    var self = this;

    // super-constructor
    instance_skel.apply(this, arguments);

    self.actions(); // export actions

    return self;
}


// Return config fields for web config
instance.prototype.config_fields = function () {
    var self = this;

    return [
        {
            type: 'textinput',
            id: 'ip',
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

instance.prototype.init = function () {
    var self = this;

    self.init_variables();
    self.init_presets();
    self.init_feedbacks();
    self.init_poll();

    self.data = {};
    self.auth_error = false;
    self.mode = -1;
}

instance.prototype.destroy = function () {
    var self = this;

    clearInterval(self.pollingInterval);
}

instance.prototype.choices_mode = [
    { id: 0, label: 'Show', path: 'show' },
    { id: 1, label: 'Blank', path: 'blank' },
    { id: 2, label: 'Theme', path: 'theme' },
    { id: 3, label: 'Desktop', path: 'desktop' }
];

instance.prototype.init_poll = function () {
    var self = this;

    self.pollingInterval = setInterval(function () {
        self.poll();
    }, 500);
}

instance.prototype.init_variables = function () {
    var self = this;
    var variables = [
        {
            label: 'Display Mode',
            name: 'display_mode'
        }
    ];

    self.setVariableDefinitions(variables);
    self.setVariable('display_mode', 'Unknown');
}

instance.prototype.init_presets = function () {
    var self = this;
    var presets = [];
    var size = '18';

    presets.push({
        category: 'Slides',
        label: 'Next Slide',
        bank: {
            style: 'text',
            text: 'Next Slide',
            size: size,
            color: self.rgb(255, 255, 255),
            bgolor: self.rgb(0, 0, 0)
        },
        actions: [{
            action: 'next'
        }]
    });

    presets.push({
        category: 'Service Items',
        label: 'Next Service Item',
        bank: {
            style: 'text',
            text: 'Next Service Item',
            size: size,
            color: self.rgb(255, 255, 255),
            bgolor: self.rgb(0, 0, 0)
        },
        actions: [{
            action: 'nextSi'
        }]
    });

    presets.push({
        category: 'Slides',
        label: 'Previous Slide',
        bank: {
            style: 'text',
            text: 'Prev Slide',
            size: size,
            color: self.rgb(255, 255, 255),
            bgcolor: self.rgb(0, 0, 0)
        },
        actions: [{
            action: 'previous'
        }]
    });

    presets.push({
        category: 'Service Items',
        label: 'Prev Service Item',
        bank: {
            style: 'text',
            text: 'Prev Service Item',
            size: size,
            color: self.rgb(255, 255, 255),
            bgolor: self.rgb(0, 0, 0)
        },
        actions: [{
            action: 'prevSi'
        }]
    });

    for (var mode in self.choices_mode) {
        presets.push({
            category: 'Modes',
            label: self.choices_mode[mode].label,
            bank: {
                style: 'text',
                size: size,
                text: self.choices_mode[mode].label,
                color: self.rgb(255, 255, 255),
                bgcolor: self.rgb(0, 0, 0)
            },
            actions: [{
                action: 'mode',
                options: {
                    mode: self.choices_mode[mode].id
                }
            }],
            feedbacks: [{
                type: 'mode',
                options: {
                    mode: self.choices_mode[mode].id,
                    background: self.rgb(0, 0, 255),
                    foreground: self.rgb(255, 255, 255)
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
        label: 'Background color active',
        id: 'background',
        default: this.rgb(0, 0, 255)
    },
    {
        type: 'colorpicker',
        label: 'Foreground color active',
        id: 'foreground',
        default: this.rgb(255, 255, 255)
    }];

    feedbacks['mode'] = {
        label: 'Display mode state change',
        description: 'Changes the foreground and background color of the bank if the display mode changes to the defined state',
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

instance.prototype.actions = function () {
    var self = this;

    self.system.emit('instance_actions', self.id, {
        'next': { label: 'Next Slide' },
        'previous': { label: 'Previous Slide' },
        'nextSi': { label: 'Next Service Item' },
        'prevSi': { label: 'Prev Service Item' },
        'mode': {
            label: 'Display Mode',
            options: [
                {
                    type: 'dropdown',
                    id: 'mode',
                    label: 'mode',
                    default: 0,
                    choices: self.choices_mode
                }
            ]
        }
    });
}

instance.prototype.action = function (action) {
    var self = this;

    var headers = {};
    if (self.config.username && self.config.password) {
        headers['Authorization'] = 'Basic ' + Buffer.from(self.config.username + ':' + self.config.password).toString('base64');
    }
    var urlBase = 'http://' + self.config.ip + ':' + self.config.port + '/api';
    var urlAction = '';
    switch (action.action) {
        case 'mode':
            var path = self.choices_mode[action.options.mode].path;
            urlAction = '/display/' + path;
            break;
        case 'nextSi':
            urlAction = '/service/next';
            break;
        case 'prevSi':
            urlAction = '/service/previous';
            break;
        case 'next':
            urlAction = '/controller/live/next';
            break;
        case 'previous':
            urlAction = '/controller/live/previous';
            break;
    }

    self.system.emit('rest_get', urlBase + urlAction, function (err, result) {
        self.interpretResult(err, result);
    }, headers);
}

instance.prototype.interpretResult = function (err, result) {
    var self = this;

    if (err !== null) {
        self.log('error', 'HTTP GET Request failed (' + result.error.code + ')');
        self.status(self.STATUS_ERROR, result.error.code);
    }
    else {
        if (result.response.statusCode == 401) {
            self.auth_error = true;
            self.status(self.STATUS_ERROR, 'Authorization failed. Please check username and password.');
        }
        else if (result.response.statusCode != 200) {
            self.status(self.STATUS_ERROR, 'Got status code ' + result.response.statusCode + ' from OpenLP.');
        }
        else {
            self.auth_error = false;
            self.status(self.STATUS_OK);
        }
    }
}

instance.prototype.feedback = function (feedback) {
    var self = this;

    if (feedback.type == 'mode') {
        if (self.mode == feedback.options.mode) {
            return { color: feedback.options.foreground, bgcolor: feedback.options.background };
        }
    }
}

instance.prototype.updateConfig = function (config) {
    var self = this;
    self.config = config;
}

instance.prototype.poll = function () {
    var self = this;

    // no config set yet - so no polling
    if (!self.config.ip && !self.config.port) {
        return;
    }

    var headers = {};
    if (self.config.username && self.config.password) {
        headers['Authorization'] = 'Basic ' + Buffer.from(self.config.username + ':' + self.config.password).toString('base64');
    }

    self.system.emit('rest_get', 'http://' + self.config.ip + ':' + self.config.port + '/api/poll', function (err, result) {
        if (err !== null) {
            self.log('error', 'HTTP GET Request failed (' + result.error.code + ')');
            self.status(self.STATUS_ERROR, result.error.code);
        }
        else {
            self.data = result.data.results;
            /* polling does not need auth and no auth error is triggered. But we do not want to override the error */
            if (!self.auth_error) {
                self.status(self.STATUS_OK);
            }
            self.interpretData();
        }
    }, headers);
}

instance.prototype.interpretData = function () {
    var self = this;

    if (self.data.blank) {
        self.mode = 1; // blank
    }
    else if (self.data.theme) {
        self.mode = 2; // theme
    }
    else if (self.data.display) {
        self.mode = 3; // display
    }
    else {
        self.mode = 0; // show
    }
    self.setVariable('display_mode', self.choices_mode[self.mode].label);
    self.checkFeedbacks('mode');
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;
