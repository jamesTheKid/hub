package com.flightstats.hub.app;

import com.flightstats.hub.channel.ChannelValidator;
import com.flightstats.hub.cluster.*;
import com.flightstats.hub.dao.ChannelService;
import com.flightstats.hub.dao.ChannelServiceImpl;
import com.flightstats.hub.group.GroupCallback;
import com.flightstats.hub.group.GroupCallbackImpl;
import com.flightstats.hub.group.GroupValidator;
import com.flightstats.hub.health.HubHealthCheck;
import com.flightstats.hub.metrics.*;
import com.flightstats.hub.replication.Replicator;
import com.flightstats.hub.replication.ReplicatorImpl;
import com.flightstats.hub.rest.RetryClientFilter;
import com.flightstats.hub.time.NTPMonitor;
import com.flightstats.hub.util.HubUtils;
import com.google.inject.AbstractModule;
import com.google.inject.Provides;
import com.google.inject.Singleton;
import com.google.inject.name.Named;
import com.google.inject.name.Names;
import com.sun.jersey.api.client.Client;
import org.apache.curator.RetryPolicy;
import org.apache.curator.ensemble.fixed.FixedEnsembleProvider;
import org.apache.curator.framework.CuratorFramework;
import org.apache.curator.framework.CuratorFrameworkFactory;
import org.apache.curator.retry.BoundedExponentialBackoffRetry;
import org.apache.zookeeper.data.Stat;
import org.eclipse.jetty.websocket.jsr356.ClientContainer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.websocket.WebSocketContainer;
import java.util.concurrent.TimeUnit;

public class HubBindings extends AbstractModule {
    private final static Logger logger = LoggerFactory.getLogger(HubBindings.class);

    @Override
    protected void configure() {
        Names.bindProperties(binder(), HubProperties.getProperties());
        bind(ChannelService.class).to(ChannelServiceImpl.class).asEagerSingleton();
        bind(HubHealthCheck.class).asEagerSingleton();
        bind(ZooKeeperState.class).asEagerSingleton();
        bind(Replicator.class).to(ReplicatorImpl.class).asEagerSingleton();
        bind(HubUtils.class).asEagerSingleton();
        bind(CuratorLock.class).asEagerSingleton();

        bind(ChannelValidator.class).asEagerSingleton();
        bind(GroupValidator.class).asEagerSingleton();
        bind(GroupCallback.class).to(GroupCallbackImpl.class).asEagerSingleton();
        bind(LastContentKey.class).asEagerSingleton();
        bind(WatchManager.class).asEagerSingleton();

        if (HubProperties.getProperty("hosted_graphite.enable", false)) {
            bind(MetricsSender.class).to(HostedGraphiteSender.class).asEagerSingleton();
        } else {
            bind(MetricsSender.class).to(NoOpMetricsSender.class).asEagerSingleton();
        }
        bind(HubInstrumentedResourceMethodDispatchAdapter.class).toProvider(HubMethodTimingAdapterProvider.class).in(Singleton.class);
        bind(NTPMonitor.class).asEagerSingleton();
        bind(LeaderRotator.class).asEagerSingleton();
    }

    @Singleton
    @Provides
    public static CuratorFramework buildCurator(@Named("app.name") String appName, @Named("app.environment") String environment,
                                                @Named("zookeeper.connection") String zkConnection,
                                                RetryPolicy retryPolicy, ZooKeeperState zooKeeperState) {
        logger.info("connecting to zookeeper(s) at " + zkConnection);
        FixedEnsembleProvider ensembleProvider = new FixedEnsembleProvider(zkConnection);
        CuratorFramework curatorFramework = CuratorFrameworkFactory.builder().namespace(appName + "-" + environment)
                .ensembleProvider(ensembleProvider)
                .retryPolicy(retryPolicy).build();
        curatorFramework.getConnectionStateListenable().addListener(zooKeeperState.getStateListener());
        curatorFramework.start();

        try {
            Stat stat = curatorFramework.checkExists().forPath("/startup");
        } catch (Exception e) {
            logger.warn("unable to access zookeeper");
            throw new RuntimeException("unable to access zookeeper");
        }
        return curatorFramework;
    }

    @Singleton
    @Provides
    public static RetryPolicy buildRetryPolicy() {
        return new BoundedExponentialBackoffRetry(
                HubProperties.getProperty("zookeeper.baseSleepTimeMs", 10),
                HubProperties.getProperty("zookeeper.maxSleepTimeMs", 10000),
                HubProperties.getProperty("zookeeper.maxRetries", 20));
    }

    @Singleton
    @Provides
    public static Client buildJerseyClient() {
        return create(true);
    }

    @Named("NoRedirects")
    @Singleton
    @Provides
    public static Client buildJerseyClientNoRedirects() {
        return create(false);
    }

    private static Client create(boolean followRedirects) {
        int connectTimeoutMillis = (int) TimeUnit.SECONDS.toMillis(HubProperties.getProperty("http.connect.timeout.seconds", 30));
        int readTimeoutMillis = (int) TimeUnit.SECONDS.toMillis(HubProperties.getProperty("http.read.timeout.seconds", 120));

        Client client = Client.create();
        client.setConnectTimeout(connectTimeoutMillis);
        client.setReadTimeout(readTimeoutMillis);
        client.addFilter(new RetryClientFilter());
        client.addFilter(new com.sun.jersey.api.client.filter.GZIPContentEncodingFilter());
        client.setFollowRedirects(followRedirects);
        return client;
    }

    @Singleton
    @Provides
    public static WebSocketContainer buildWebSocketContainer() throws Exception {
        ClientContainer container = new ClientContainer();
        container.start();
        return container;
    }

}