import 'reflect-metadata';

import { AesCrypto } from 'lite-ts-crypto';
import {
    bodyParserJsonExpressOption,
    corsExpressOption,
    ExpressApiFactory,
    ExpressApiPort,
    ExpressCallApiRequestHandler,
    ExpressGetApiRequestHandler,
    ExpressInitTraceRequestHandler,
    ExpressResponseRequestHandler,
    ExpressSetSessionRequestHandler,
    ExpressTraceLogRequestHandler,
    portExpressOption,
    routeExpressOption
} from 'lite-ts-express';
import { FileFactoryBase } from 'lite-ts-fs';
import { LogFactoryBase } from 'lite-ts-log';
import { TracerBase } from 'lite-ts-tracer';
import Container from 'typedi';

import { initIoC } from './service/ioc';

(async () => {
    const cfg = await initIoC();
    if (typeof cfg.port == 'number') {
        cfg.port = {
            http: cfg.port
        } as any;
    }

    const fileFactory = Container.get<FileFactoryBase>(FileFactoryBase as any);

    const apiFactory = new ExpressApiFactory(fileFactory.buildDirectory(__dirname, 'api'));
    const tracer = Container.get<TracerBase>(TracerBase as any);
    const tracerRequestHandler = new ExpressInitTraceRequestHandler(tracer);
    tracerRequestHandler.setNext(
        new ExpressGetApiRequestHandler(apiFactory, cfg.displayError)
    ).setNext(
        new ExpressTraceLogRequestHandler(
            Container.get<LogFactoryBase>(LogFactoryBase as any),
            'request',
            ctx => {
                return ctx.req.body;
            }
        )
    ).setNext(
        new ExpressTraceLogRequestHandler(
            Container.get<LogFactoryBase>(LogFactoryBase as any),
            'headers',
            ctx => {
                return ctx.req.headers;
            }
        )
    ).setNext(
        new ExpressSetSessionRequestHandler(new AesCrypto(cfg.authSecretKey))
    ).setNext(
        new ExpressCallApiRequestHandler()
    ).setNext(
        new ExpressTraceLogRequestHandler(
            Container.get<LogFactoryBase>(LogFactoryBase as any),
            'response',
            ctx => {
                return ctx.apiResp;
            },
            true
        )
    ).setNext(
        new ExpressResponseRequestHandler()
    );

    await new ExpressApiPort([
        corsExpressOption({}),
        bodyParserJsonExpressOption({
            limit: '16mb'
        }),
        routeExpressOption(
            'get',
            '/',
            new ExpressResponseRequestHandler(ctx => {
                ctx.resp.json({
                    name: cfg.name,
                    version: cfg.version
                });
            })
        ),
        routeExpressOption(
            'post',
            '/:endpoint/:api',
            tracerRequestHandler
        ),
        portExpressOption(cfg.name, cfg.port.http, cfg.version)
    ]).listen();

})();
