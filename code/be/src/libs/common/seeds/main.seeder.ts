import { Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ConfigurationMockData,
  roleMockData,
  RoomTypeMock,
  UserMockData,
  UserTypeMockData,
} from 'src/libs/common/seeds/mocks';
import { Configuration } from 'src/modules/configurations/entities';
import { RoomType } from 'src/modules/room-types/entities';
import { Profile } from 'src/modules/users/entities/profile.entity';
import { Role } from 'src/modules/users/entities/role.entity';
import { UserType } from 'src/modules/users/entities/user-type.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { RoleEnum } from 'src/modules/users/enums/role.enum';
import { UserTypeEnum } from 'src/modules/users/enums/user-type.enum';
import { DataSource, QueryRunner } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export class MainSeeder implements Seeder {
  private readonly logger = new Logger(MainSeeder.name);

  async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const queryRunner: QueryRunner = dataSource.createQueryRunner();
    await queryRunner.startTransaction();

    try {
      const entityManager = queryRunner.manager;

      const roleRepository = entityManager.getRepository(Role);
      const roleFactory = factoryManager.get(Role);
      const userTypeRepository = entityManager.getRepository(UserType);
      const userTypeFactory = factoryManager.get(UserType);
      const userRepository = entityManager.getRepository(User);
      const userFactory = factoryManager.get(User);
      const profileRepository = entityManager.getRepository(Profile);
      const configurationRepository =
        entityManager.getRepository(Configuration);
      const configurationFactory = factoryManager.get(Configuration);
      const roomTypeRepository = entityManager.getRepository(RoomType);
      const roomTypeFactory = factoryManager.get(RoomType);

      this.logger.log('Starting seeding role data...');

      for (const roleData of roleMockData) {
        if (
          !(await roleRepository.findOne({
            where: { roleName: roleData.roleName },
          }))
        ) {
          const role = await roleFactory.make({
            roleName: roleData.roleName,
            description: roleData.description,
          });

          await roleRepository.save(role);
        }
      }

      this.logger.log('Starting seeding user type data...');

      for (const userTypeData of UserTypeMockData) {
        if (
          !(await userTypeRepository.findOne({
            where: {
              typeName: userTypeData.typeName,
            },
          }))
        ) {
          const newUserType = await userTypeFactory.make({
            typeName: userTypeData.typeName,
            description: userTypeData.description,
            surcharge_factor: userTypeData.surcharge_factor,
          });

          await userTypeRepository.save(newUserType);
        }
      }

      this.logger.log('Seeding user admin data...');

      if (
        !(await userRepository.findOne({
          where: {
            role: {
              roleName: RoleEnum.ADMIN,
            },
          },
          relations: ['role'],
        }))
      ) {
        const { password, email, ...res } = UserMockData;

        const hashedPassword = await bcrypt.hash(
          password,
          bcrypt.genSaltSync(),
        );

        const newUserAdmin = await userFactory.make({
          email,
          password: hashedPassword,
        });

        const newProfile = profileRepository.create(res);

        await profileRepository.save(newProfile);

        const userType = await userTypeRepository.findOneBy({
          typeName: UserTypeEnum.LOCAL,
        });

        if (!userType)
          throw new NotFoundException('User type local not found in database.');

        const adminRole = await roleRepository.findOneBy({
          roleName: RoleEnum.ADMIN,
        });

        if (!adminRole)
          throw new NotFoundException(`Admin role not found in database.`);

        newUserAdmin.profile = newProfile;
        newUserAdmin.userType = userType;
        newUserAdmin.role = adminRole;

        await userRepository.save(newUserAdmin);
      }

      this.logger.log('Seeding configuration data...');

      for (const configurationData of ConfigurationMockData) {
        if (
          !(await configurationRepository.findOne({
            where: {
              configName: configurationData.config_name,
            },
          }))
        ) {
          const { config_name, config_value } = configurationData;

          const newConfig = await configurationFactory.make({
            configName: config_name,
            configValue: config_value,
          });

          await configurationRepository.save(newConfig);
        }
      }

      this.logger.log('Seeding room type data...');

      for (const roomTypeData of RoomTypeMock) {
        if (
          !(await roomTypeRepository.findOne({
            where: {
              name: roomTypeData.name,
            },
          }))
        ) {
          const newRoomType = await roomTypeFactory.make(roomTypeData);

          await roomTypeRepository.save(newRoomType);
        }
      }

      this.logger.log('Seeding finished successfully.');

      await queryRunner.commitTransaction();
    } catch (err) {
      console.error(err);
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }
}
