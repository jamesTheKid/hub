package com.flightstats.hub.health;

import com.flightstats.hub.app.HubServices;
import com.flightstats.hub.spoke.RemoteSpokeStore;
import com.google.common.util.concurrent.AbstractIdleService;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicBoolean;

@Singleton
public class HubHealthCheck {
    private final static Logger logger = LoggerFactory.getLogger(HubHealthCheck.class);

    @Inject
    private RemoteSpokeStore remoteSpokeStore;

    private final AtomicBoolean shutdown = new AtomicBoolean(false);
    private final AtomicBoolean startup = new AtomicBoolean(true);

    public HubHealthCheck() {
        HubServices.register(new HealthService(), HubServices.TYPE.INITIAL_POST_START);
    }

    private class HealthService extends AbstractIdleService {

        @Override
        protected void startUp() throws Exception {
            if (!remoteSpokeStore.testAll()) {
                logger.warn("unable to cleanly start Spoke!");
                throw new RuntimeException("unable to cleanly start Spoke");
            }
            startup.set(false);
        }

        @Override
        protected void shutDown() throws Exception {
            shutdown();
        }
    }

    public HealthStatus getStatus() {
        HealthStatus.HealthStatusBuilder builder = HealthStatus.builder();
        if (shutdown.get()) {
            return builder.healthy(false).description("SHUTTING DOWN").build();
        }
        if (startup.get()) {
            return builder.healthy(false).description("Starting up...").build();
        }
        return builder.healthy(true).description("OK").build();
    }

    public void shutdown() {
        shutdown.set(true);
    }

    public boolean isShuttingDown() {
        return shutdown.get();
    }

}
