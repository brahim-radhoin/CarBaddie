import { Link } from "react-router-dom";
import { useServiceTypes, useDeleteServiceType } from "../api"; // Import the new hooks
import { ServiceTypeRead } from "../types";
import { AxiosError } from "axios";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Wrench, PlusCircle, AlertTriangle, Edit, Trash2, MoreHorizontal, ListChecks, Loader2 } from "lucide-react";


export function ManageServiceTypesPage() {
  // --- React Query Hooks ---
  const { data: serviceTypes = [], isLoading, isError, error } = useServiceTypes();
  const { mutate: deleteServiceType, isPending: isDeleting } = useDeleteServiceType();

  // Sort the data for display
  const sortedServiceTypes = [...serviceTypes].sort((a, b) => a.name.localeCompare(b.name));


  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto animate-pulse">
        <Skeleton className="h-6 w-1/2 mb-6" /> {/* Breadcrumb */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div className="space-y-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-32" />
          </CardHeader>
          <CardContent>
            <div className="border rounded-md">
              <Skeleton className="h-12 w-full" /> {/* Table header */}
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full border-t" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{(error as AxiosError<{detail: string}>)?.response?.data?.detail || "Could not fetch service types."}</AlertDescription>
        </Alert>
      </div>
    );
  }


  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/vehicles">Home</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Manage Service Types</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4">
          <div>
            <CardTitle className="text-2xl flex items-center"><Wrench className="mr-3 h-6 w-6 text-primary" />Manage Service Types</CardTitle>
            <CardDescription className="mt-1">View, edit, or create new service types for your maintenance logs.</CardDescription>
          </div>
          <Button asChild size="default" className="w-full sm:w-auto">
            <Link to="/service-types/new"><PlusCircle className="mr-2 h-4 w-4" />Create New</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {sortedServiceTypes.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-lg bg-muted/30">
              <ListChecks className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-lg font-medium">No service types found.</p>
              <p className="text-sm text-muted-foreground mb-4">Get started by creating your first service type.</p>
              <Button asChild size="sm"><Link to="/service-types/new"><PlusCircle className="mr-2 h-4 w-4" />Create Service Type</Link></Button>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedServiceTypes.map((type) => (
                    <TableRow key={type.id}>
                      <TableCell className="font-medium">{type.name}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild><Link to={`/service-types/${type.id}/edit`} className="flex items-center w-full"><Edit className="mr-2 h-3.5 w-3.5" />Edit</Link></DropdownMenuItem>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the service type: <strong>{type.name}</strong>. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteServiceType(type.id)} className="bg-destructive hover:bg-destructive/90">
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Yes, delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}