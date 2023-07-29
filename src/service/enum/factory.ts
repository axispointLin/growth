import { EnumFactoryBase } from 'lite-ts-enum';
import { ITraceable, TracerStrategy } from 'lite-ts-tracer';

export class EnumFactory extends EnumFactoryBase implements ITraceable<EnumFactoryBase> {
    public withTrace(parentSpan: any) {
        return parentSpan ? new EnumFactory(
            new TracerStrategy(this.loadHandler).withTrace(parentSpan),
            this.reduceFunc
        ) : this;
    }
}
