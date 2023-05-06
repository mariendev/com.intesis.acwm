import Homey from 'homey';
import API from '../../assets/api/index';

class MyDriver extends Homey.Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('MH-AC-WIFI-1 driver has been initialized');
    }

    async onPair(session: any) {
        this.log('Start pairing');

        session.setHandler('list_devices', async () => {
            const devices = await this.onPairListDevices();

            let registeredDevices = this.getDevices();
            let devicesFound: number = 0;
            for (let device of registeredDevices) {
                for (let d of devices) {
                    let registered = device.getStore().address;
                    let found = d.store.address;
                    if (registered === found) {
                        devicesFound++;
                    }
                }
            }

            this.log('Devices already installed: ' + devicesFound + ' Total found: ' + devices.length);

            if (devicesFound >= devices.length) {
                await session.showView('by_ip');
                return [];
            }

            return devices;
        });

        session.setHandler('ipVerify', async (ip: string) => {
            this.log('Trying '+ ip);
            try {
                const device = new API(ip);
                let info = await device.getInfo();
                return info.wlanSTAMAC;
            } catch (e) {
                this.log(e);
                // device is not a recognized device
                return false;
            }
        });

        session.setHandler("showView", async (viewId: any) => {
            this.log(viewId);
        });
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
