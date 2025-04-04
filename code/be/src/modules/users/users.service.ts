import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { omit } from 'lodash';
import { HashingProvider } from 'src/libs/common/providers';
import { Repository } from 'typeorm';
import { UsersRepository } from './users.repository';
import { Profile, Role, UserType } from 'src/modules/users/entities';
import { SignUpDto } from 'src/modules/auth/dto';
import { SearchUsersDto, UpdateUserDto } from 'src/modules/users/dto';
import {
  RoleEnum,
  ProfileStatusEnum,
  UserTypeEnum,
} from 'src/modules/users/enums';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UsersRepository)
    private readonly userRepository: UsersRepository,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly hashingProvider: HashingProvider,
    @InjectRepository(UserType)
    private readonly userTypeRepository: Repository<UserType>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
  ) {}

  async createUser(signUpDto: SignUpDto) {
    const existingUserWithEmail = await this.userRepository.findOne({
      where: {
        email: signUpDto.email,
      },
    });

    if (existingUserWithEmail)
      throw new BadRequestException(
        `This email has already been used by another user.`,
      );

    const { password, email, userTypeName, ...res } = signUpDto;

    const userRole = await this.roleRepository.findOne({
      where: { roleName: RoleEnum.USER },
    });

    if (!userRole)
      throw new NotFoundException('Role user not found in database.');

    const existingUserType = await this.userTypeRepository.findOne({
      where: { typeName: userTypeName },
    });

    if (!existingUserType)
      throw new NotFoundException(
        `Type '${userTypeName}' not found in database.`,
      );

    const hashedPassword = await this.hashingProvider.hashPassword(password);

    const newUser = this.userRepository.create({
      email,
      password: hashedPassword,
    });

    const newProfile = this.profileRepository.create(res);
    await this.profileRepository.save(newProfile);

    newUser.profile = newProfile;
    newUser.userType = existingUserType;
    newUser.role = userRole;

    await this.userRepository.save(newUser);

    return omit(
      await this.userRepository.findOne({
        where: { id: newUser.id },
        relations: ['role', 'profile', 'userType'],
      }),
      [
        'password',
        'role.createdAt',
        'role.updatedAt',
        'role.deletedAt',
        'role.id',
        'role.description',
        'profile.createdAt',
        'profile.updatedAt',
        'profile.deletedAt',
        'userType.description',
        'userType.createdAt',
        'userType.updatedAt',
        'userType.deletedAt',
      ],
    );
  }

  async findAll(searchUsersDto?: SearchUsersDto) {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.userType', 'userType')
      .leftJoinAndSelect('user.role', 'role')
      .select([
        'user.id',
        'user.email',
        'profile.id',
        'profile.fullName',
        'profile.nationality',
        'profile.status',
        'profile.address',
        'profile.phoneNumber',
        'profile.dob',
        'profile.identityNumber',
        'profile.createdAt',
        'profile.updatedAt',
        'role.roleName',
        'userType.typeName',
      ]);

    if (searchUsersDto) {
      if (searchUsersDto?.address) {
        qb.andWhere('LOWER(profile.address) LIKE LOWER(:address)', {
          address: `%${searchUsersDto.address}%`,
        });
      }

      if (searchUsersDto?.email) {
        qb.andWhere('LOWER(user.email) LIKE LOWER(:email)', {
          email: `%${searchUsersDto?.email}%`,
        });
      }

      if (searchUsersDto?.fullName) {
        qb.andWhere('LOWER(profile.fullName) LIKE LOWER(:fullName)', {
          fullName: `%${searchUsersDto.fullName}%`,
        });
      }

      if (searchUsersDto?.identityNumber) {
        qb.andWhere(
          'LOWER(profile.identityNumber) LIKE LOWER(:identityNumber)',
          {
            identityNumber: `%${searchUsersDto.identityNumber}%`,
          },
        );
      }

      if (searchUsersDto?.status) {
        qb.andWhere('profile.status = :status', {
          status: `%${searchUsersDto.status}%`,
        });
      }
    }

    qb.andWhere('role.roleName != :roleName', { roleName: 'admin' });

    return await qb.getMany();
  }

  async findOne(email: string) {
    return await this.userRepository.findOne({
      where: {
        email,
      },
      relations: ['role', 'profile', 'userType'],
      select: {
        id: true,
        email: true,
        profile: {
          id: true,
          fullName: true,
          nationality: true,
          status: true,
          address: true,
          phoneNumber: true,
          dob: true,
          identityNumber: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
        role: {
          roleName: true,
        },
        userType: {
          typeName: true,
        },
      },
    });
  }

  public handleDeleteUser = async (userId: string) => {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    if (!user)
      throw new NotFoundException(`User with id: '${userId}' not found.`);

    user.profile.status = ProfileStatusEnum.INACTIVE;

    await this.profileRepository.softDelete({ id: user.profile.id });

    await this.userRepository.save(user);

    return this.findAll();
  };

  public handleGetProfileByUserId = async (userId: string) => {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['profile', 'role', 'userType'],
      select: {
        id: true,
        email: true,
        profile: {
          id: true,
          fullName: true,
          nationality: true,
          status: true,
          address: true,
          phoneNumber: true,
          dob: true,
          identityNumber: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
        role: {
          roleName: true,
        },
        userType: {
          typeName: true,
        },
      },
    });

    if (!user)
      throw new NotFoundException(`User with id: '${userId}' not found.`);

    return user;
  };

  public handleUpdateUser = async (
    id: string,
    updateUserDto: UpdateUserDto,
  ) => {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['profile'],
    });

    if (!user) throw new NotFoundException(`User with id: '${id}' not found.`);

    if (!Object.keys(updateUserDto).length)
      throw new BadRequestException(
        `You must be provide some information to update the profile.`,
      );

    const { email, ...res } = updateUserDto;

    if (email) {
      await this.userRepository.update({ id }, { email });
    }

    const profileId = user.profile.id;

    await this.profileRepository.update({ id: profileId }, res);

    return await this.userRepository.findOne({
      where: { id },
      relations: ['role', 'profile', 'userType'],
      select: {
        id: true,
        email: true,
        profile: {
          id: true,
          fullName: true,
          nationality: true,
          status: true,
          address: true,
          phoneNumber: true,
          dob: true,
          identityNumber: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
        role: {
          roleName: true,
        },
        userType: {
          typeName: true,
        },
      },
    });
  };

  public handleGetProfileWithPassword = async (email: string) => {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['role'],
      select: {
        password: true,
        id: true,
        role: {
          roleName: true,
        },
        email: true,
      },
    });

    if (!user)
      throw new NotFoundException(`User with email: '${email}' not found.`);

    return user;
  };

  public handleGetUserTypeByName = async (typeName: UserTypeEnum) => {
    const userType = await this.userTypeRepository.findOne({
      where: {
        typeName,
      },
    });

    if (!userType)
      throw new NotFoundException(`User type ${typeName} not found.`);

    return userType;
  };

  public handleGetUserByField = async (field: string, value: string) => {
    return this.userRepository.findOne({
      where: {
        [field]: value,
      },
      relations: ['role'],
    });
  };
}
