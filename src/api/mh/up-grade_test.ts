import { DbFactoryBase, IUnitOfWork } from 'lite-ts-db';
import { Enum, EnumFactoryBase } from 'lite-ts-enum';
import { UserFactory, UserService } from 'lite-ts-express';
import { Mock, mockAny } from 'lite-ts-mock';
import { MutexBase } from 'lite-ts-thread';
import { ValueService } from 'lite-ts-value';

import Self from './up-grade';
import { enum_ } from '../../model';

const conditions = [[{
    count: 1,
    op: '=',
    valueType: 10
}]];
const growthNo = 1;

describe('src/api/mh/up-grade_test.ts', () => {
    describe('.call()', () => {
        it('up grade', async () => {
            const mockDbFactory = new Mock<DbFactoryBase>();
            const mockEnumFactory = new Mock<EnumFactoryBase>();
            const mockMutex = new Mock<MutexBase>();
            const mockUserFactory = new Mock<UserFactory>();
            const self = new Self();
            self.dbFactory = mockDbFactory.actual;
            self.enumFactory = mockEnumFactory.actual;
            self.mutex = mockMutex.actual;
            self.userFactory = mockUserFactory.actual;
            self.growthNo = growthNo;

            Reflect.set(
                self,
                'session',
                {
                    id: 1
                }
            );

            mockMutex.expectReturn(
                r => r.lock(mockAny),
                () => { }
            );

            const mockUow = new Mock<IUnitOfWork>();
            mockDbFactory.expectReturn(
                r => r.uow(),
                mockUow.actual
            );

            const mockUserService = new Mock<UserService>({
                session: {
                    id: 1,
                    areaNo: 1
                }
            });
            mockUserFactory.expectReturn(
                r => r.build(mockAny),
                mockUserService.actual
            );

            const mockGrowthEnum = new Mock<Enum<enum_.GradeData>>({
                items: [{
                    conditions,
                    consumes: [{
                        count: 3,
                        valueType: 20
                    }],
                    rewards: [{
                        count: 1,
                        valueType: 10
                    }],
                    scene: '升品'
                }]
            });
            mockEnumFactory.expectReturn(
                r => r.build(mockAny),
                mockGrowthEnum.actual
            );

            const mockGrowthValueService = new Mock<ValueService>();
            mockUserService.expectReturn(
                r => r.getValueService(mockAny),
                mockGrowthValueService.actual
            );
            mockGrowthValueService.expectReturn(
                r => r.checkConditions(mockUow.actual, conditions),
                false
            );

            await self.call();
        });
    });
});