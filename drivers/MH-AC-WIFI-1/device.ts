import Homey, {DiscoveryResult} from 'homey';
import API from '../../assets/api/index';

export class MhAcWifi1 extends Homey.Device {
    private api: API | undefined;
    private pollTimer!: NodeJS.Timer;
    private blindTimeTimer!: NodeJS.Timer;
    private blindTime: boolean = false;

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        await this.addCapability('remote_mh');
        this.registerCapabilityListener('onoff', this.onPowerOnoff.bind(this));
        this.registerCapabilityListener('thermostat_mode_mh', this.onThermostatMode.bind(this));
        this.registerCapabilityListener('fan_rate_mh', this.onFanRate.bind(this));
        this.registerCapabilityListener('vane_updown_position_mh', this.onVaneUpDownDirection.bind(this));
        this.registerCapabilityListener('remote_mh', this.onRemoteSet.bind(this));
        this.registerCapabilityListener('target_temperature.inside', this.onSetPoint.bind(this));

        const {address} = this.getStore();

        if (address != null && this.api === undefined) {
            this.api = new API(address);

            const {password, username, interval} = this.getSettings();
            await this.login(username, password, true);

            // Set up Polling
            this.setPollTimer(interval ?? 10);
        }

        this.log(this.getName() + ' device has been initialized');
    }

    /**
     * The Intesis module needs time to communicate to the unit itself to retrieve the set values.
     * With the blind time we enforce that we never retrieve values directly after setting new values
     * @private
     */
    private enforceBlindTime() {
        if(this.blindTimeTimer != null) {
            clearTimeout(this.blindTimeTimer);
        }
        this.blindTime = true;
        this.blindTimeTimer = setTimeout(() => {
            this.blindTime = false;
            this.updateAllValues().then()
        }, 5000);
    }

    async onPowerOnoff(value: any) {
        if (!this.api || !this.getAvailable()) {
            return;
        }
        this.log('onPowerOnoff', value);
        await this.api.setDataPointValue(1, (value ? 1 : 0));

        this.enforceBlindTime();
    }

    async onThermostatMode(value: string) {
        if (!this.api || !this.getAvailable()) {
            return;
        }
        this.log('onThermostatMode', value);
        await this.api.setDataPointValue(2, Number(value));

        this.enforceBlindTime();
    }

    async onFanRate(value: string) {
        if (!this.api || !this.getAvailable()) {
            return;
        }
        this.log('onFanRate', value);
        await this.api.setDataPointValue(4, Number(value));

        this.enforceBlindTime();
    }

    async onRemoteSet(value: number) {
        if (!this.api || !this.getAvailable()) {
            return;
        }
        this.log('onRemoteSet', value);
        await this.api.setDataPointValue(12, value);

        this.enforceBlindTime();
    }

    async onVaneUpDownDirection(value: string) {
        if (!this.api || !this.getAvailable()) {
            return;
        }
        this.log('onVaneUpDownDirection', value);
        await this.api.setDataPointValue(5, Number(value));

        this.enforceBlindTime();
    }

    async onSetPoint(value: number) {
        if (!this.api || !this.getAvailable()) {
            return;
        }
        this.log('onSetpoint', value);
        await this.api.setDataPointValue(9, value * 10);

        this.enforceBlindTime();
    }

    async updateAllValues() {
        if (!this.api || !this.getAvailable() || this.blindTime) {
            return;
        }

        const result = await this.api.getDataPointValue();

        for (let x of result) {
            try {
                // this.log(x);
                switch (x.uid) {
                    case 1:
                        await this.setCapabilityValue('onoff', x.value == 1);
                        break;
                    case 2:
                        await this.setCapabilityValue('thermostat_mode_mh', String(x.value));
                        break;
                    case 4:
                        await this.setCapabilityValue('fan_rate_mh', String(x.value));
                        break;
                    case 5:
                        await this.setCapabilityValue('vane_updown_position_mh', String(x.value));
                        break;
                    case 9:
                        await this.setCapabilityValue('target_temperature.inside', x.value / 10);
                        break;
                    case 10:
                        await this.setCapabilityValue('measure_temperature.inside', x.value / 10);
                        await this.setCapabilityValue('measure_temperature_inside', x.value / 10);
                        break;
                    case 12:
                        await this.setCapabilityValue('remote', Number(x.value) === 0);
                        await this.setCapabilityValue('remote_mh', String(x.value));
                        break;
                    case 37:
                        await this.setCapabilityValue('measure_temperature_outside', x.value / 10);
                        break;
                    default:
                        break;
                }
            } catch (e) {
                this.log(e)
            }
        }
    }

    // Set up timer to poll status of the device
    setPollTimer(interval: number) {
        if (this.pollTimer != null) {
            clearInterval(this.pollTimer);
        }
        this.pollTimer = setInterval(this.updateAllValues, (interval ?? 10) * 1000);
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log(this.getName() + ' has been added');
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    // @ts-ignore
    async onSettings({oldSettings, newSettings, changedKeys}): Promise<string | void> {
        if (!this.api) {
            return;
        }
        await this.api.logout();

        await this.login(newSettings.username, newSettings.password);

        this.log(this.getName() + ' settings where changed');
    }

    async login(username: string, password: string, throwError: boolean = false) {
        if (!this.api) {
            this.log('Intesis API not available');
            await this.setUnavailable();
            return;
        }

        try {
            await this.api.login(username, password);
        } catch (e: any) {
            if (throwError) {
                throw Error(e.error.message);
            }
            await this.setUnavailable(e.error.message);
            if (e.error.code !== 5) {
                this.error(e);
            }
            return;
        }

        await this.setAvailable();
        await this.updateAllValues();
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name: string) {
        this.log(this.getName() + ' was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.log(this.getName() + ' has been deleted');
    }

    onDiscoveryResult(discoveryResult: DiscoveryResult) {
        //check it this instance belongs to discovered device
        const data = this.getData();
        return data.id === discoveryResult.id;
    }

    async onDiscoveryAvailable(discoveryResult: DiscoveryResult) {
        this.log(this.getName() + ' discovered, initialize');

        if (this.api === undefined) {
            const data = this.getStore();
            this.api = new API(data.address);
        }

        const {password, username, interval} = this.getSettings();
        await this.login(username, password, true);

        // Set up Polling
        this.setPollTimer(interval ?? 10);
    }

    async onDiscoveryAddressChanged(discoveryResult: any) {
        this.log(this.getName() + ' ip changed to ' + discoveryResult.address);
        await this.setStoreValue('address', discoveryResult.address);

        this.api = new API(discoveryResult.address);

        const {password, username} = this.getSettings();
        await this.login(username, password);
    }

    async onDiscoveryLastSeenChanged(discoveryResult: DiscoveryResult) {
        this.log(this.getName() + ' change last seen');
        if (this.api) {
            const {password, username} = this.getSettings();
            await this.login(username, password);
        }
    }
}

module.exports = MhAcWifi1;
