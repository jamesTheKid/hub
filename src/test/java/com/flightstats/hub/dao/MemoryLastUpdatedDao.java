package com.flightstats.hub.dao;

import com.flightstats.hub.model.ContentKey;
import com.flightstats.hub.websocket.WebsocketPublisher;
import com.google.inject.Inject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 *
 */
public class MemoryLastUpdatedDao implements LastUpdatedDao {
    private final static Logger logger = LoggerFactory.getLogger(MemoryLastUpdatedDao.class);

    private final WebsocketPublisher websocketPublisher;
    private Map<String, ContentKey> contentKeyMap = new ConcurrentHashMap<>();

    @Inject
    public MemoryLastUpdatedDao(WebsocketPublisher websocketPublisher) {
        this.websocketPublisher = websocketPublisher;
    }

    @Override
    public void update(String channelName, ContentKey key) {
        logger.info("inserting " + key.keyToString());
        contentKeyMap.put(channelName, key);
        websocketPublisher.publish(channelName, key);
    }

    @Override
    public ContentKey getLastUpdated(String channelName) {
        return contentKeyMap.get(channelName);
    }

    @Override
    public void delete(String channelName) {
        contentKeyMap.remove(channelName);
    }

    @Override
    public void initialize(String channelName) {

    }
}