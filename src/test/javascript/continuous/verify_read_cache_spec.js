require('../integration_config');

const moment = require('moment');

const channelName = 'batch_test_1';
const channelResource = `${channelUrl}/${channelName}`;

describe(__filename, () => {

    // this test makes a few assumptions:
    //
    //  - there is a channel named "batch_test_1" on the hub you run this against
    //  - that channel has data in it older than spokeTTLMinutes
    //  - we can find an item, not already in the read cache, in 3 attempts
    //
    // if one of the above assumptions is not true the entire spec is skipped

    it(`has a channel named "${channelName}"`, (done) => {
        utils.httpGet(channelResource)
            .then(response => {
                if (response.statusCode !== 200) {
                    pending();
                }
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    let spokeTTLMinutes;

    it('gets the spokeTTLMinutes for the cluster', (done) => {
        utils.httpGet(`${hubUrlBase}/internal/properties`)
            .then(response => {
                expect(response.statusCode).toEqual(200);
                spokeTTLMinutes = response.body.properties['spoke.write.ttlMinutes'];
                console.log('spokeTTLMinutes:', spokeTTLMinutes);
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    let urisToChooseFrom;

    it('has data old enough to use', (done) => {
        expect(spokeTTLMinutes).toBeDefined();
        let timeInThePast = moment().utc().subtract(spokeTTLMinutes + 1, 'minutes');
        let timePath = timeInThePast.format('YYYY/MM/DD/HH/mm');
        let url = `${channelResource}/${timePath}`;
        utils.httpGet(url)
            .then(response => {
                if (response.body._links.uris.length === 0) {
                    pending('no data old enough');
                }
                urisToChooseFrom = response.body._links.uris;
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    let itemURL;
    let timeURL;

    it('tries to get data to use for verification', (done) => {
        expect(urisToChooseFrom).toBeDefined();
        expect(Array.isArray(urisToChooseFrom)).toBeTruthy();
        expect(urisToChooseFrom.length).toBeGreaterThan(0);
        itemURL = getRandomURI(urisToChooseFrom);
        timeURL = getTimeURIFromItemURI(itemURL);
        console.log('trying to get usable data (first attempt)');
        utils.httpGet(`${timeURL}?location=CACHE_READ`)
            .then(utils.followRedirectIfPresent)
            .then(response => {
                if (response.body._links.uris.includes(itemURL)) {
                    itemURL = getUniqueURI(urisToChooseFrom, itemURL);
                    timeURL = getTimeURIFromItemURI(itemURL);
                    console.log('trying to get usable data (second attempt)');
                    return utils.httpGet(`${itemURL}?location=CACHE_READ`)
                        .then(utils.followRedirectIfPresent);
                } else {
                    console.log('itemURL:', itemURL);
                    console.log('timeURL:', timeURL);
                }
            })
            .then(response => {
                if (response === undefined) return;
                if (response.body._links.uris.includes(itemURL)) {
                    itemURL = getUniqueURI(urisToChooseFrom, itemURL);
                    timeURL = getTimeURIFromItemURI(itemURL);
                    console.log('trying to get usable data (third attempt)');
                    return utils.httpGet(`${itemURL}?location=CACHE_READ`)
                        .then(utils.followRedirectIfPresent);
                } else {
                    console.log('itemURL:', itemURL);
                    console.log('timeURL:', timeURL);
                }
            })
            .then(response => {
                if (response === undefined) return;
                if (response.body._links.uris.includes(itemURL)) {
                    pending('giving up on finding usable data');
                } else {
                    console.log('itemURL:', itemURL);
                    console.log('timeURL:', timeURL);
                }
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    it('receives a list without our item from the write cache', (done) => {
        expect(timeURL).toBeDefined();
        utils.httpGet(`${timeURL}?location=CACHE_WRITE`)
            .then(utils.followRedirectIfPresent)
            .then(response => {
                let uris = response.body._links.uris;
                console.log('uris:', uris);
                expect(uris).not.toContain(itemURL);
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    it('receives a list without our item from the read cache', (done) => {
        expect(timeURL).toBeDefined();
        utils.httpGet(`${timeURL}?location=CACHE_READ`)
            .then(utils.followRedirectIfPresent)
            .then(response => {
                let uris = response.body._links.uris;
                console.log('uris:', uris);
                expect(uris).not.toContain(itemURL);
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    let itemPayload;

    it('gets the item from default sources', (done) => {
        expect(itemURL).toBeDefined();
        utils.httpGet(itemURL)
            .then(response => {
                expect(response.statusCode).toEqual(200);
                itemPayload = response.body;
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    it('receives a list without our item from the write cache still', (done) => {
        expect(timeURL).toBeDefined();
        utils.httpGet(`${timeURL}?location=CACHE_WRITE`)
            .then(utils.followRedirectIfPresent)
            .then(response => {
                let uris = response.body._links.uris;
                console.log('uris:', uris);
                expect(uris).not.toContain(itemURL);
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    it('receives a list with our item from the read cache', (done) => {
        expect(timeURL).toBeDefined();
        utils.httpGet(`${timeURL}?location=CACHE_READ`)
            .then(utils.followRedirectIfPresent)
            .then(response => {
                let uris = response.body._links.uris;
                console.log('uris:', uris);
                expect(uris).toContain(itemURL);
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

    it('verifies the item from read cache matches the item from S3', (done) => {
        expect(itemPayload).toBeDefined();
        utils.httpGet(itemURL)
            .then(response => {
                expect(response.statusCode).toEqual(200);
                expect(response.body).toEqual(itemPayload);
            })
            .catch(error => expect(error).toBeNull())
            .finally(done);
    });

});

const getRandomURI = (uris) => {
    let uriIndex = utils.randomNumberBetweenInclusive(0, uris.length - 1);
    return uris[uriIndex];
};

const getTimeURIFromItemURI = (itemURI) => {
    let hashIndex = itemURI.lastIndexOf('/');
    let msIndex = itemURI.lastIndexOf('/', hashIndex - 1);
    return itemURI.slice(0, msIndex);
};

const getUniqueURI = (urisToChooseFrom, ...alreadyUsedURIs) => {
    let uri = getRandomURI(urisToChooseFrom);
    while (alreadyUsedURIs.includes(uri)) {
        console.log('randomly selected uri already tried; skipping', uri);
        uri = getRandomURI(urisToChooseFrom);
    }
    return uri;
};
