import Homey from 'homey';
import API from '../../assets/api/index';

class MyDriver extends Homey.Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('MH-AC-WIFI-1 driver has been initialized');
    }

    async onPairListDevices() {
        const strategy = this.getDiscoveryStrategy();
        const results = strategy.getDiscoveryResults();

        let list = [];
        for (let discoverDevice of Object.values(results)) {
            try {
                const device = new API(discoverDevice.address);
                await device.getInfo();
            } catch (e) {
                // device is not a recognized device
                continue;
            }

            list.push({
                name: 'MH-AC-WIFI-1 (' + discoverDevice.address + ')',
                data: {
                    id: discoverDevice.id
                },
                store: {
                    address: discoverDevice.address,
                },
            })
        }
        return list;
    }
}

module.exports = MyDriver;
