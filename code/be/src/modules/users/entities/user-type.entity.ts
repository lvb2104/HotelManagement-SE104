import { User } from 'src/modules/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserTypeEnum } from '../enums/user-type.enum';

@Entity()
export class UserType {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({
    type: 'enum',
    enum: UserTypeEnum,
    default: UserTypeEnum.LOCAL,
  })
  typeName!: UserTypeEnum;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'decimal', scale: 2, precision: 10 })
  surcharge_factor!: number;

  @OneToMany(() => User, (user) => user.userType, {
    cascade: true,
    orphanedRowAction: 'delete',
  })
  users!: User[];

  @CreateDateColumn({ type: 'timestamp' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  readonly updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  readonly deletedAt?: Date;
}
