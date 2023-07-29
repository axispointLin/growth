import { EnumItem } from 'lite-ts-enum';

export class GameAreaData extends EnumItem {
    /**
     * APP编号
     */
    public appAreaNo: number;

    /**
     * 连接信息
     */
    public connectionString: {
        [app: string]: string;
    };
}
