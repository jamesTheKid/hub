package com.flightstats.datahub.service.exceptions;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.ws.rs.core.Response;
import javax.ws.rs.ext.ExceptionMapper;

public abstract class AbstractExceptionMapper<T extends Throwable> implements ExceptionMapper<T>
{
	private static final Logger logger = LoggerFactory.getLogger( AbstractExceptionMapper.class );

	@Override
	public Response toResponse(T exception) {
		logger.info(exception.getMessage());
		Response.ResponseBuilder builder = Response.status( getResponseCode() );
		builder.entity(exception.getMessage());
		return builder.build();
	}

	protected abstract Response.Status getResponseCode();
}
