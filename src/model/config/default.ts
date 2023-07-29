import { TracingConfig, TracingOptions } from 'jaeger-client';

export class Default {
    public authSecretKey: string;
    public auth: {
        [endpoint: string]: string;
        secretKey: string;
    };
    public configUrl: string;
    public displayError: boolean;
    public distributedMongo: string;
    public enumSep: string;
    public grpcProtoFilePath: string;
    public log4js: any;
    public mongo: string;
    public name: string;
    public openTracing: {
        config: TracingConfig;
        options: TracingOptions;
    };
    public port: {
        grpc: number;
        http: number;
    };
    public redis: {
        host: string;
        port: number;
    };
    public version: string;
}
