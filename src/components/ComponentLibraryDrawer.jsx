import { BellIcon, BoxesIcon, CameraIcon, HeartIcon, SparklesIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

function ShowcaseSection({ title, children }) {
  return (
    <section className="grid gap-3">
      <span className="text-xs font-black uppercase text-muted-foreground">{title}</span>
      <div className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-background/48 p-4">
        {children}
      </div>
    </section>
  );
}

function ComponentLibraryDrawer() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button className="w-full justify-between rounded-[var(--radius-lg)] px-5" type="button" variant="ghost">
          <span>Component Library</span>
          <BoxesIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Component Library</DrawerTitle>
        </DrawerHeader>
        <div className="grid gap-5 overflow-y-auto px-5 pb-5">
          <ShowcaseSection title="Button">
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="primary">Primary</Button>
              <Button type="button" variant="ghost">Ghost</Button>
              <Button type="button" variant="danger">Danger</Button>
              <Button type="button" variant="mini">Mini</Button>
              <Button type="button" variant="cameraTool">
                <CameraIcon data-icon="inline-start" aria-hidden="true" />
                Camera
              </Button>
              <Button data-active="true" type="button" variant="nav">
                <HeartIcon data-icon="inline-start" aria-hidden="true" />
                Nav
              </Button>
            </div>
            <Button aria-label="Icon button" className="justify-self-start" size="icon" type="button" variant="icon">
              <SparklesIcon aria-hidden="true" />
            </Button>
          </ShowcaseSection>

          <ShowcaseSection title="Input">
            <Input aria-label="Sample input" defaultValue="Pocofoto" />
            <Input aria-label="Placeholder input" placeholder="Placeholder" />
            <Input aria-label="Disabled input" disabled value="Disabled" readOnly />
          </ShowcaseSection>

          <ShowcaseSection title="Dialog">
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog</DialogTitle>
                  <DialogDescription>Styled dialog preview.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button type="button" variant="primary">Primary</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </ShowcaseSection>

          <ShowcaseSection title="Sonner">
            <Button
              type="button"
              variant="ghost"
              onClick={() => toast('Pocofoto toast')}
            >
              <BellIcon data-icon="inline-start" aria-hidden="true" />
              Show Toast
            </Button>
          </ShowcaseSection>

          <ShowcaseSection title="Spinner">
            <div className="flex items-center gap-4">
              <Spinner />
              <Button disabled type="button" variant="primary">
                <Spinner />
                Loading
              </Button>
            </div>
          </ShowcaseSection>
        </div>
        <div className="px-5 pb-[calc(var(--safe-bottom)+18px)] pt-1">
          <DrawerClose asChild>
            <Button className="w-full" type="button" variant="ghost">
              <XIcon data-icon="inline-start" aria-hidden="true" />
              Close
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default ComponentLibraryDrawer;
