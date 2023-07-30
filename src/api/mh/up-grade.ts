import { Min } from 'class-validator';
import { DbFactoryBase } from 'lite-ts-db';
import { EnumFactoryBase } from 'lite-ts-enum';
import { ExpressUserSession, IApi } from 'lite-ts-express';
import { MutexBase } from 'lite-ts-thread';
import { ValueService, ValueTypeData } from 'lite-ts-value';
import { Inject, Service } from 'typedi';

import { enum_ } from '../../model';

@Service()
export default class UpGradeApi extends ExpressUserSession implements IApi {

    @Inject()
    public dbFactory: DbFactoryBase;

    @Inject()
    public enumFactory: EnumFactoryBase;

    @Inject()
    public mutex: MutexBase;

    @Min(0)
    public growthNo: number;

    public async call() {
        const unlock = await this.mutex.lock({
            key: this.session.id
        });

        try {
            const uow = this.dbFactory.uow();

            const session = await this.userService.session;
            const allItem = await this.enumFactory.build({
                app: 'growth',
                areaNo: session.areaNo,
                typer: enum_.GradeData
            }).items;
            let growthValueService: ValueService = await this.userService.getValueService(uow); // TODO: 养成数值服务
            let gradeData: enum_.GradeData;
            for (const r of allItem) {
                const ok = await growthValueService.checkConditions(uow, r.conditions);
                if (ok) {
                    gradeData = r;
                    break;
                }
            }
            if (!gradeData)
                return; // 数据不存在

            let valueTypeData: ValueTypeData; // 枚举数值
            const source = `${valueTypeData.text + gradeData.text}`;
            const userValueService = await this.userService.getValueService(uow);
            await userValueService.update(
                uow,
                gradeData.consumes.map(r => {
                    return {
                        ...r,
                        source
                    };
                })
            );
            await growthValueService.update(
                uow,
                gradeData.rewards.map(r => {
                    return {
                        ...r,
                        source
                    };
                })
            );

            await uow.commit();
        } finally {
            await unlock();
        }
    }
}