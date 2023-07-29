import { EnumItem } from 'lite-ts-enum';

export class LoadBalanceData extends EnumItem {
    /**
     * 服务名称
     */
    public app: string;
    /**
     * URL
     */
    public url: string;
}
