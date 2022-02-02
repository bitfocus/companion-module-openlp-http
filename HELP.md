# OpenLP

This module lets you interact with [OpenLP](https://openlp.org/), an open source worship presentation software.

![streamdeck-sample.png](docs/streamdeck-sample.png)<br>

### OpenLP Configuration

- Allow Remote module in OpenLP, then set listener IP address to 0.0.0.0 in the configuration. Use ethernet if possible rather than wireless.

### Configuration in Companion

- Select your OpenLP version 2.4 or 3.0
- Type in the IP address (127.0.0.1 if running locally) and port previously set in OpenLP application
- Set user and password if required

### Available Actions

- Set display mode (blank/show/desktop/theme)
- Toggle display mode (show/blank)
- Go to specific slide number (by number)
- Go to specific service item (by number)
- Progress into next/previous slide/service item

### Available Variables

- Current display mode
- Current slide number
- Current selected service item
- Service item title #1, title #2, ... up to 20

### Available Feedbacks

- Current display mode
- Current slide number
- Service item selected (by number)
- Service item on specific slide (by number)
