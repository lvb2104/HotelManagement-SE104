import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RoomType } from 'src/modules/room-types/entities';
import { RoomTypesService } from 'src/modules/room-types/room-types.service';
import {
  CreateRoomDto,
  SearchRoomsDto,
  UpdateRoomDto,
} from 'src/modules/rooms/dto';
import { Room } from 'src/modules/rooms/entities/room.entity';
import { RoomStatusEnum } from 'src/modules/rooms/enums';
import { Repository } from 'typeorm';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
    private readonly roomTypeService: RoomTypesService,
  ) {}

  async createRoom(createRoomDto: CreateRoomDto) {
    const { roomNumber, roomTypeId } = createRoomDto;

    const existingRoomWithRoomNumber = await this.roomRepository.findOne({
      where: { roomNumber },
    });

    if (existingRoomWithRoomNumber)
      throw new BadRequestException(
        `Room with number: '${roomNumber}' already exists.`,
      );

    const roomType = await this.roomTypeService.findOne(roomTypeId);

    let newRoom = this.roomRepository.create(createRoomDto);

    newRoom.roomType = roomType;

    await this.roomRepository.save(newRoom);

    newRoom = (await this.roomRepository.findOne({
      where: { id: newRoom.id },
      relations: ['roomType'],
    })) as Room;

    return newRoom;
  }

  async findAll(searchRoomsDto?: SearchRoomsDto) {
    const qb = this.roomRepository
      .createQueryBuilder('rooms')
      .leftJoinAndSelect('rooms.roomType', 'roomType');

    if (searchRoomsDto) {
      if (searchRoomsDto?.roomNumber) {
        qb.andWhere('LOWER(rooms.roomNumber) LIKE LOWER(:roomNumber)', {
          name: `%${searchRoomsDto.roomNumber}%`,
        });
      }

      if (searchRoomsDto?.price) {
        qb.andWhere('roomType.roomPrice = :price', {
          price: searchRoomsDto.price,
        });
      }

      if (searchRoomsDto?.roomTypeName) {
        qb.andWhere('LOWER(roomType.name) LIKE LOWER(:roomTypeName)', {
          roomTypeName: `%${searchRoomsDto.roomTypeName}%`,
        });
      }

      if (searchRoomsDto.status) {
        qb.andWhere('LOWER(rooms.status) LIKE LOWER(:status)', {
          status: `%${searchRoomsDto.status}%`,
        });
      }
    }

    return await qb.getMany();
  }

  async findOne(id: string) {
    const findRoom = await this.roomRepository.findOne({
      where: { id },
      relations: {
        roomType: true,
      },
    });

    return findRoom;
  }

  async updateRoom(id: string, updateRoomDto: UpdateRoomDto) {
    const room = await this.roomRepository.findOne({
      where: { id },
      relations: ['roomType'],
    });

    if (!room) throw new NotFoundException(`Room with id: '${id}' not found.`);

    const { roomTypeId, ...res } = updateRoomDto;

    if (
      res?.roomNumber &&
      (
        await this.roomRepository.findOne({
          where: {
            roomNumber: res.roomNumber,
          },
        })
      )?.id !== id
    )
      throw new BadRequestException(
        `Room ${res.roomNumber} has existed in the system.`,
      );

    let roomType: RoomType | null = null;

    if (roomTypeId) {
      roomType = await this.roomTypeService.findOne(roomTypeId);

      if (!roomType)
        throw new NotFoundException(
          `Room type with id: '${roomTypeId}' not found.`,
        );
    }

    await this.roomRepository.update(
      { id },
      { ...res, ...(roomType && { roomType }) },
    );

    return this.roomRepository.findOne({
      where: { id },
      relations: ['roomType'],
    });
  }

  async removeRoom(id: string) {
    const findRoom = await this.roomRepository.findOneBy({ id });

    if (!findRoom)
      throw new NotFoundException(`Room with id: '${id}' not found.`);

    await this.roomRepository.softDelete(findRoom.id);

    return await this.roomRepository.find({ relations: ['roomType'] });
  }

  public handleUpdateStatusOfRoom = async (
    roomId: string,
    status: RoomStatusEnum,
  ) => {
    try {
      const room = await this.roomRepository.findOne({
        where: {
          id: roomId,
        },
      });

      if (!room)
        throw new BadRequestException(
          `Room with id '${roomId}' not found in the system.`,
        );

      room.status = status;

      await this.roomRepository.save(room);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };
}
