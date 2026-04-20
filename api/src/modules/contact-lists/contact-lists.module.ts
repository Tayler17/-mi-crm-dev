import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactList } from './contact-list.entity';
import { ContactListsService } from './contact-lists.service';
import { ContactListsController } from './contact-lists.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ContactList])],
  controllers: [ContactListsController],
  providers: [ContactListsService],
  exports: [ContactListsService],
})
export class ContactListsModule {}
