package com.flightstats.hub.group;

import com.github.rholder.retry.Retryer;
import com.github.rholder.retry.RetryerBuilder;
import com.github.rholder.retry.WaitStrategies;
import com.google.common.base.Predicate;
import com.sun.jersey.api.client.ClientHandlerException;
import com.sun.jersey.api.client.ClientResponse;
import org.joda.time.DateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.Nullable;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class GroupRetryer {

    private final static Logger logger = LoggerFactory.getLogger(GroupRetryer.class);

    public static Retryer<ClientResponse> buildRetryer(String name, GroupError groupError, AtomicBoolean hasLeadership) {
        return RetryerBuilder.<ClientResponse>newBuilder()
                .retryIfException(throwable -> {
                    if (throwable != null) {
                        groupError.add(name, new DateTime() + " " + throwable.getMessage());
                        if (throwable.getClass().isAssignableFrom(ClientHandlerException.class)) {
                            logger.info("got ClientHandlerException trying to call client back " + throwable.getMessage());
                        } else {
                            logger.info("got throwable trying to call client back ", throwable);
                        }
                    }
                    return throwable != null;
                })
                .retryIfResult(new Predicate<ClientResponse>() {
                    @Override
                    public boolean apply(@Nullable ClientResponse response) {
                        if (response == null) return true;
                        try {
                            boolean failure = response.getStatus() != 200;
                            if (failure) {
                                groupError.add(name, new DateTime() + " " + response.toString());
                                logger.info("unable to send to " + response);
                            }
                            return failure;
                        } finally {
                            close(response);
                        }
                    }

                    private void close(ClientResponse response) {
                        try {
                            response.close();
                        } catch (ClientHandlerException e) {
                            logger.info("exception closing response", e);
                        }
                    }
                })
                .withWaitStrategy(WaitStrategies.exponentialWait(1000, 1, TimeUnit.MINUTES))
                .withStopStrategy(new GroupStopStrategy(hasLeadership))
                .build();
    }
}