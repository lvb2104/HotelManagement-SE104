import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { omit } from 'lodash';
import { BookingDetailsService } from 'src/modules/booking-details/booking-details.service';
import { CreateBookingDto, UpdateBookingDto } from 'src/modules/bookings/dto';
import { InvoicesService } from 'src/modules/invoices/invoices.service';
import { UsersService } from 'src/modules/users/users.service';
import { RoleEnum } from '../users/enums';
import { BookingsRepository } from './bookings.repository';
import { Booking } from './entities';
import { DeleteBookingDetailsDto } from 'src/modules/booking-details/dto/delete-booking-details.dto';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(BookingsRepository)
    private readonly bookingsRepository: BookingsRepository,
    private readonly usersService: UsersService,
    private readonly bookingDetailsService: BookingDetailsService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async findAll(userId: string) {
    const existingUser = await this.usersService.handleGetUserByField(
      'id',
      userId,
    );

    if (!existingUser) {
      throw new NotFoundException(`User with id: '${userId}' not found.`);
    }

    let existingBookings: Booking[] = [];

    const relations = ['user', 'bookingDetails'];

    const isAdmin =
      existingUser.role.roleName === RoleEnum.ADMIN ? true : false;

    existingBookings = await this.bookingsRepository.find({
      where: isAdmin
        ? {}
        : {
            user: {
              id: userId,
            },
          },
      relations,
      select: isAdmin
        ? undefined
        : {
            id: true,
            totalPrice: true,
            createdAt: true,
            bookingDetails: true,
          },
    });

    // map bookings to remove sensitive data
    return existingBookings.map((booking) => {
      return omit(booking, [
        'user.password',
        'user.role',
        'user.userType',
        'user.createdAt',
        'user.updatedAt',
        'user.deletedAt',
        'user.profile.createdAt',
        'user.profile.updatedAt',
        'user.profile.deletedAt',
      ]);
    });
  }

  async findOne(id: string, userId: string) {
    const existingUser = await this.usersService.handleGetUserByField(
      'id',
      userId,
    );

    if (!existingUser) {
      throw new NotFoundException(`User with id: '${userId}' not found.`);
    }

    const existingBooking = await this.bookingsRepository.findOne({
      where: {
        id,
      },
      relations: ['user'],
    });

    if (!existingBooking) {
      throw new NotFoundException(`Booking with id: '${id}' not found.`);
    }

    if (
      existingBooking.user.id !== userId &&
      existingUser.role.roleName !== RoleEnum.ADMIN
    )
      throw new ForbiddenException(
        'This booking does not belong to you, so you cannot view it.',
      );

    return omit(existingBooking, [
      'user.password',
      'user.role',
      'user.userType',
      'user.createdAt',
      'user.updatedAt',
      'user.deletedAt',
      'user.profile.createdAt',
      'user.profile.updatedAt',
      'user.profile.deletedAt',
    ]);
  }

  async remove(
    id: string,
    userId: string,
    deleteBookingDetailsDto?: DeleteBookingDetailsDto,
  ) {
    const existingUser = await this.usersService.handleGetUserByField(
      'id',
      userId,
    );

    if (!existingUser) {
      throw new NotFoundException(`User with id: '${userId}' not found.`);
    }

    const existingBooking = await this.bookingsRepository.findOne({
      where: {
        id,
      },
      relations: {
        user: true,
        bookingDetails: true,
      },
    });

    if (!existingBooking) {
      throw new NotFoundException(`Booking with id '${id}' not found.`);
    }

    const countBookingDetailIds =
      deleteBookingDetailsDto?.bookingDetailIds?.length;

    const bookingIds =
      deleteBookingDetailsDto?.bookingDetailIds ??
      existingBooking.bookingDetails.map((bd) => bd.id);

    await this.bookingDetailsService.handleSoftDelete(bookingIds);

    return omit(
      !countBookingDetailIds
        ? await this.bookingsRepository.softRemove(existingBooking)
        : existingBooking,
      [
        'user.password',
        'user.role',
        'user.userType',
        'user.createdAt',
        'user.updatedAt',
        'user.deletedAt',
        'user.profile.createdAt',
        'user.profile.updatedAt',
        'user.profile.deletedAt',
      ],
    );
  }

  async create({ createBookingDetailDtos }: CreateBookingDto, userId: string) {
    const bookingDetails = await Promise.all(
      createBookingDetailDtos.map((dto) =>
        this.bookingDetailsService.create(dto, userId),
      ),
    );

    const newBooking = this.bookingsRepository.create({
      totalPrice: bookingDetails.reduce(
        (acc, curr) => acc + curr.totalPrice,
        0,
      ),
    });

    await this.bookingsRepository.save(newBooking);

    await this.bookingDetailsService.handleAssignBookingDetailsToBooking(
      bookingDetails,
      newBooking,
    );

    return omit(
      await this.bookingsRepository.findOne({
        where: {
          id: newBooking.id,
        },
        relations: ['bookingDetails', 'user'],
      }),
      ['user.password'],
    );
  }

  public handleUpdate = async (
    { updateBookingDetailDtos }: UpdateBookingDto,
    userId: string,
    bookingId: string,
  ) => {
    const booking = await this.bookingsRepository.findOne({
      where: { id: bookingId },
      relations: {
        bookingDetails: true,
      },
    });

    if (!booking)
      throw new NotFoundException(`Booking with id '${bookingId}' not found.`);

    await Promise.all(
      updateBookingDetailDtos.map((dto) =>
        this.bookingDetailsService.updateOne(dto, userId),
      ),
    );

    booking.totalPrice =
      await this.invoicesService.handleCalculatePriceOfInvoicesByBookingDetailIds(
        booking.bookingDetails.map((bd) => bd.id),
      );

    return await this.bookingsRepository.save(booking);
  };
}
