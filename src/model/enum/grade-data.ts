import { EnumItem } from 'lite-ts-enum';
import { Value, ValueCondition } from 'lite-ts-value';

export class GradeData extends EnumItem {
    public conditions: ValueCondition[][];
    public consumes: Value[];
    public rewards: Value[];
    public scene: string;
}