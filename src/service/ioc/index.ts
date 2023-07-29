import Container from 'typedi';

import { BentRpc, BentServerRpc } from 'lite-ts-bent';
import { CacheBase, CacheMemory, ExpireableCache } from 'lite-ts-cache';
import { ConfigCacheLoader, ConfigLoaderBase } from 'lite-ts-config';
import { AreaDbFactory, DbFactoryBase } from 'lite-ts-db';
import { EnumFactoryBase, EnumLoadHandlerBase, EnumLoadHandlerContext } from 'lite-ts-enum';
import { UserFactory } from 'lite-ts-express';
import { FsFileFactory, FileFactoryBase } from 'lite-ts-fs';
import { ChildTracer, JaegerClientDbFactory, JaegerClientRpc, JeagerClientRedis } from 'lite-ts-jaeger-client';
import { ConsoleLog, LogFactoryBase } from 'lite-ts-log';
import { Log4jsLog } from 'lite-ts-log4js';
import { StringGeneratorBase } from 'lite-ts-math';
import { AreaData, MongoConfigLoader, MongoDbFactory, MongoEnumLoadHandler, MongoStringGenerator } from 'lite-ts-mongo';
import { IoredisAdapter, RedisEnumLoadHandler, RedisBase, RedisCache, RedisMutex, RedisNowTime } from 'lite-ts-redis';
import { ValueTypeRewardAddition, ValueTypeRewardOpen, valueTypeRewardAdditionReduce, valueTypeRewardOpenReduce } from 'lite-ts-reward';
import { RpcBase, RpcEnumLoadHandler } from 'lite-ts-rpc';
import { MutexBase, SetTimeoutThread, ThreadBase } from 'lite-ts-thread';
import { DateTime, NowTimeBase, TimeBase } from 'lite-ts-time';
import { TracerBase } from 'lite-ts-tracer';
import { UserFactoryBase } from 'lite-ts-user';
import { ValueTypeData, ValueTypeTextOfValue, valueTypeTextOfValueReduce } from 'lite-ts-value';
import { JsYamlConfigLoader } from 'lite-ts-yaml';

import { EnumFactory } from '../enum';
import { config, enum_ } from '../../model';

export async function initIoC() {
    let yamlFilename = 'config.yaml';
    for (const r of process.argv) {
        if (r.includes('.yaml')) {
            yamlFilename = r;
            break;
        } else if (r.includes('mocha')) {
            yamlFilename = 'config-it.yaml';
            break;
        }
    }

    const fileFactory = new FsFileFactory();
    Container.set(FileFactoryBase, fileFactory);

    const jsYamlConfigLoader = new JsYamlConfigLoader(
        fileFactory.buildFile(
            process.cwd(),
            yamlFilename
        )
    );
    const cfg = await jsYamlConfigLoader.load(config.Default);
    const pkg = await fileFactory.buildFile(
        process.cwd(),
        'package.json'
    ).read<{ version: string; }>();
    cfg.version = pkg.version;

    const thread = new SetTimeoutThread();
    Container.set(ThreadBase, thread);

    if (cfg.log4js)
        Log4jsLog.init(cfg.log4js);

    const logFactory = {
        build() {
            return cfg.log4js ? new Log4jsLog() : new ConsoleLog();
        }
    };
    Container.set(LogFactoryBase, logFactory);

    let tracer: TracerBase;
    if (cfg.openTracing) {
        tracer = new ChildTracer(cfg);
        Container.set(TracerBase, tracer);
    }

    const redis = new IoredisAdapter(cfg.redis);
    const jeagerClientRedis = new JeagerClientRedis(redis, tracer);
    Container.set(RedisBase, jeagerClientRedis);

    const time = new DateTime();
    Container.set(TimeBase, time);

    const nowTime = new RedisNowTime(redis, time);
    Container.set(NowTimeBase, nowTime);

    const mongo = cfg.distributedMongo || cfg.mongo;
    const dbFactory = new MongoDbFactory(!!cfg.distributedMongo, cfg.name, mongo);

    const cache = new RedisCache(jeagerClientRedis, cfg.name, {
        'framework-config': [
            AreaData.name,
            enum_.GameAreaData.name,
            ValueTypeData.ctor,
            enum_.LoadBalanceData.name
        ]
    });
    const enumLoadHandler = new RedisEnumLoadHandler(cache);
    Container.set(CacheBase, cache);

    const enumFactory = new EnumFactory(enumLoadHandler,
        {
            [ValueTypeData.name]: {
                [ValueTypeRewardAddition.ctor]: valueTypeRewardAdditionReduce,
                [ValueTypeRewardOpen.ctor]: valueTypeRewardOpenReduce,
                [ValueTypeTextOfValue.ctor]: valueTypeTextOfValueReduce
            }
        }
    );
    Container.set(EnumFactoryBase, enumFactory);

    const expireableCache = new ExpireableCache([60000, 100000]);
    const areaDbFactory = new AreaDbFactory(
        dbFactory,
        async (areaNo) => {
            const allItem = await enumFactory.build<AreaData>({
                app: 'config',
                typer: AreaData
            }).allItem;
            if (!allItem[areaNo])
                return null;

            return new MongoDbFactory(false, cfg.name, allItem[areaNo].connectionString[cfg.name]);
        }
    );
    const jaegerClientDbFactory = new JaegerClientDbFactory(areaDbFactory, tracer);
    Container.set(DbFactoryBase, jaegerClientDbFactory);

    const configLoader = new ConfigCacheLoader(
        expireableCache,
        [
            jsYamlConfigLoader,
            new MongoConfigLoader(jaegerClientDbFactory)
        ]
    );
    Container.set(ConfigLoaderBase, configLoader);

    const stringGenerator = new MongoStringGenerator();
    Container.set(StringGeneratorBase, stringGenerator);

    const rpc = new BentServerRpc(expireableCache, async () => {
        const rpc = new BentRpc(cfg.configUrl, logFactory);
        const res = await rpc.call<{ [enumName: string]: enum_.LoadBalanceData[]; }>({
            route: '/ih/find-enum-items',
            body: {
                names: [enum_.LoadBalanceData.name]
            },
            isThrow: true
        });
        return res.data[enum_.LoadBalanceData.name].reduce((memo, r) => {
            memo[r.app] = new BentRpc(r.url, logFactory);
            return memo;
        }, {});
    });

    const jaegerClientRpc = new JaegerClientRpc(rpc, tracer);
    Container.set(RpcBase, jaegerClientRpc);

    const rpcEnumLoadHandler = new RpcEnumLoadHandler(jaegerClientRpc);
    const mongoEnumLoadHandler = new MongoEnumLoadHandler(areaDbFactory);
    enumLoadHandler.setNext({
        handle: async (ctx: EnumLoadHandlerContext) => {
            await (ctx.app == 'growth' ? mongoEnumLoadHandler : rpcEnumLoadHandler).handle(ctx);
        }
    } as EnumLoadHandlerBase);

    const mutex = new RedisMutex(jeagerClientRedis, thread);
    Container.set(MutexBase, mutex);

    const userAreaCache = new CacheMemory();
    const userFactory = new UserFactory(
        userAreaCache,
        jaegerClientDbFactory,
        enumFactory,
        nowTime,
        redis,
        jaegerClientRpc,
        time,
        {
            // [ValueService.name]: userValueServiceBuilder(areaDbFactory, enumFactory, jaegerClientRpc, time),
            // [GrowthFactoryBase.name]: opt => new GrowthFactory(areaDbFactory, enumFactory, nowTime, rpc, stringGenerator, time, opt.userService)
        }
    );
    Container.set(UserFactoryBase, userFactory);

    return cfg;
}
